#!/usr/bin/env node
/**
 * Тюнер весов политики: подбирает числа `greedy` по винрейту против самой `greedy` как эталона.
 *
 * Зачем: веса политики — это вектор, а не код, и подобрать его перебором дешевле, чем писать новую
 * эвристику руками (`TODO`, «Тюнер весов политики»). Поиск — покоординатный спуск: по очереди двигаем
 * каждый вес (×2, ×0.5, ×1.5, ×0.67), принимаем только улучшение, проходы повторяем до бюджета времени.
 *
 * Фитнес — винрейт кандидата **против эталона**: 6 пар играются в обе стороны (кандидат первым и вторым),
 * поэтому сила героев сокращается, а эталон всегда даёт 50% — с ним и сравниваем.
 *
 * Что честно: поиск идёт на одних сидах, а итог проверяется на других (`--validate-seeds`), иначе
 * получим подгонку под конкретные раздачи. Скрытых данных кандидат не читает — он ходит тем же
 * `actionsFor`, что и `greedy`.
 *
 * Запуск: `node bot/tools/tuner.js --minutes=5`, быстрая проверка — `--minutes=0.5 --games=6`.
 * Печатает готовый кусок `policies.tuned` — его переносят в `bot/play/policy.js` руками, если винрейт вырос.
 */
import { policies } from '../play/policy.js';
import { runSweep } from './sweep.js';

/** Эталон: политика, которую пытаемся обыграть. */
const BASE = 'greedy';

/** Гены: вес удара, прочей карты (по ситуации), добора (по ситуации), паса, шагов, защиты, карт и свойств. */
const GENES = {
  attack: 10,
  cardAttack: 3,
  cardIdle: 5,
  drawAttack: 1,
  drawIdle: 8,
  pass: 1,
  step: 8,
  stepCloser: 6,
  stepAway: 7,
  hold: 4,
  terrain: 5,
  movePass: 1,
  movePassIdle: 10,
  defend: 6,
  defendPass: 1,
  cardValue: 1.5,
  option: 1,
  optionCost: 1,
  fatigue: 1,
};

/** Пары для фитнеса: каждая играется в обе стороны, поэтому вклад героев сокращается. */
const PAIRS = [
  ['anubis', 'dorothy'],
  ['anubis', 'ifrit'],
  ['dorothy', 'ifrit'],
  ['medusa', 'tesla'],
  ['snow-queen', 'medusa'],
  ['ifrit', 'tesla'],
];

/**
 * Геном → политика: база — сама `greedy` (признаки карты, свойства, цель и цена карты берутся из неё),
 * а гены переопределяют числа. Так кандидат отличается от эталона **только числами**: иначе тюнер
 * искал бы вокруг политики без половины признаков.
 */
export const policyFromGenome =
  genome =>
  (situation = {}) => ({
    ...policies.greedy(situation),
    attack: genome.attack,
    card: situation.canAttack ? genome.cardAttack : genome.cardIdle,
    draw: situation.canAttack ? genome.drawAttack : genome.drawIdle,
    pass: genome.pass,
    step: genome.step,
    stepCloser: genome.stepCloser,
    stepAway: genome.stepAway,
    hold: genome.hold,
    terrain: genome.terrain,
    stepIdle: 0,
    movePass: genome.movePass,
    movePassIdle: genome.movePassIdle,
    defend: genome.defend,
    defendPass: genome.defendPass,
    cardValue: genome.cardValue,
    option: genome.option,
    optionCost: genome.optionCost,
    fatigue: genome.fatigue,
  });

const round2 = value => Math.round(value * 100) / 100;

/**
 * Винрейт кандидата против эталона: каждая пара играется в обе стороны, сиды одни и те же.
 * Кандидат всегда играет **первого** игрока, а первым ходит `heroB` на чётных сидах и `heroA` на
 * нечётных, поэтому победителя сверяем с тем героем, которым кандидат играл в этой партии.
 */
export const scoreGenome = (genome, { seeds }) => {
  const candidate = policyFromGenome(genome);
  let wins = 0;
  let games = 0;

  for (const [left, right] of PAIRS) {
    for (const [heroA, heroB] of [
      [left, right],
      [right, left],
    ]) {
      const reports = runSweep(seeds, { heroA, heroB, policy: candidate, policyB: BASE });
      for (const report of reports) {
        if (report.status !== 'finished') continue;
        const candidateHero = Number(report.seed) % 2 === 0 ? heroB : heroA;
        games += 1;
        if (String(report.state.winner) === String(candidateHero)) wins += 1;
      }
    }
  }

  return { rate: games > 0 ? Math.round((wins / games) * 100) : 0, wins, games };
};

/** Числовой флаг вида `--имя=значение`. */
const numberArg = (name, fallback) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  if (found == null) return fallback;
  const value = Number(found.slice(name.length + 3));
  return Number.isFinite(value) ? value : fallback;
};

const minutes = numberArg('minutes', 5);
const games = numberArg('games', 15);
const from = numberArg('from', 1);
const validateFrom = numberArg('validate-seeds', 201);
const validateGames = numberArg('validate-games', 40);
const deadline = Date.now() + minutes * 60_000;
const searchSeeds = Array.from({ length: games }, (_, index) => from + index);
const validateSeeds = Array.from({ length: validateGames }, (_, index) => validateFrom + index);

const noise = sample => 1.96 * Math.sqrt(0.25 / Math.max(1, sample)) * 100;

console.log(
  `тюнер: эталон ${BASE}, пар ${PAIRS.length} × 2 стороны × ${games} партий на оценку ` +
    `(шум ±${noise(games * PAIRS.length * 2).toFixed(1)}%), бюджет ${minutes} мин, ` +
    `проверка на сидах ${validateFrom}…${validateFrom + validateGames - 1}`,
);

const baseline = scoreGenome(GENES, { seeds: searchSeeds });
console.log(`старт: ${baseline.rate}% (${baseline.wins}/${baseline.games})`);

let best = { genome: { ...GENES }, score: baseline };
let tries = 0;

for (let pass = 1; pass <= 4 && Date.now() < deadline; pass += 1) {
  let improved = false;

  for (const gene of Object.keys(GENES)) {
    for (const factor of [2, 0.5, 1.5, 0.67]) {
      if (Date.now() > deadline) break;
      const value = round2(best.genome[gene] * factor);
      if (value === best.genome[gene] || value < 0) continue;

      const genome = { ...best.genome, [gene]: value };
      const score = scoreGenome(genome, { seeds: searchSeeds });
      tries += 1;
      // принимаем только заметный шаг: на 180 партиях разница в 1–2 п.п. — шум
      if (score.rate > best.score.rate + 1) {
        console.log(`  ${gene}: ${best.genome[gene]} → ${value} — ${score.rate}%`);
        best = { genome, score };
        improved = true;
      }
    }
  }

  console.log(
    `проход ${pass}: лучший ${best.score.rate}% (${best.score.wins}/${best.score.games}), попыток ${tries}`,
  );
  if (!improved) break;
}

const validation = scoreGenome(best.genome, { seeds: validateSeeds });
const baselineValidation = scoreGenome(GENES, { seeds: validateSeeds });
const margin = noise(validation.games);
// сравнение с эталоном на тех же сидах: кандидат всегда ходит первым, и преимущество первого игрока
// (~58% у этой политики) входит в обе оценки одинаково, поэтому вычитается
const gain = validation.rate - baselineValidation.rate;

console.log(
  `\nпроверка на удержанных сидах: кандидат ${validation.rate}% ` +
    `(${validation.wins}/${validation.games}), эталон ${baselineValidation.rate}%, ` +
    `разница ${gain > 0 ? '+' : ''}${gain} п.п., шум ±${margin.toFixed(1)}%`,
);
console.log(
  `вывод: ${gain >= margin ? 'улучшение значимо' : gain > 0 ? 'улучшение в пределах шума — в политику не берём' : 'улучшения нет'}`,
);
console.log(`\nгеном:\n${JSON.stringify(best.genome, null, 2)}`);
console.log(
  `\nкусок для bot/play/policy.js (если берём — остальные веса и признаки наследуются от ` +
    `${BASE}):\n  tuned: ({ canAttack = false } = {}) => ({\n` +
    `    ...policies.${BASE}({ canAttack }),\n` +
    `    attack: ${best.genome.attack},\n` +
    `    card: canAttack ? ${best.genome.cardAttack} : ${best.genome.cardIdle},\n` +
    `    draw: canAttack ? ${best.genome.drawAttack} : ${best.genome.drawIdle},\n` +
    `    pass: ${best.genome.pass},\n` +
    `    step: ${best.genome.step},\n` +
    `    stepCloser: ${best.genome.stepCloser},\n` +
    `    stepAway: ${best.genome.stepAway},\n` +
    `    hold: ${best.genome.hold},\n` +
    `    terrain: ${best.genome.terrain},\n` +
    `    movePass: ${best.genome.movePass},\n` +
    `    movePassIdle: ${best.genome.movePassIdle},\n` +
    `    defend: ${best.genome.defend},\n` +
    `    defendPass: ${best.genome.defendPass},\n` +
    `    cardValue: ${best.genome.cardValue},\n` +
    `    option: ${best.genome.option},\n` +
    `    optionCost: ${best.genome.optionCost},\n` +
    `    fatigue: ${best.genome.fatigue},\n  }),`,
);

// эталон из контента не должен разъехаться с геномом старта
const baseWeights = policies[BASE]({ canAttack: true });
if (baseWeights.attack !== GENES.attack) {
  console.log(
    `\nвнимание: ${BASE}.attack = ${baseWeights.attack}, а в геноме старта ${GENES.attack}` +
      ' — обнови GENES, иначе тюнер ищет вокруг чужой точки',
  );
}
