#!/usr/bin/env node
/**
 * Проба оценки листа: сколько стоит потеря помощника и видит ли лист, **кто** из них погиб.
 *
 * Зачем: у политики есть `assistantImportance` (`bot/play/pool.js`) — она знает, ломается ли механика
 * пака (Амат держит пелену, ворона носит «Клёв в темноте»), а у листа помощники свалены в два признака:
 * `assistants` (число живых) и `sidekickHp` (сумма здоровья). Проба берёт **настоящую позицию партии**,
 * убивает в ней разных бойцов по одному и показывает, на сколько сдвинулась оценка — то есть отвечает
 * числом на вопрос «различает ли лист важного помощника и обычное тело».
 *
 * Считается и выученная модель (`scoreOf`, она же лист по умолчанию: `SEARCH_EVAL=net`), и ручная
 * формула (`leafScore`, выключатель `SEARCH_EVAL=heuristic`) — видно, что каждая из них думает.
 * Рядом печатаются признаки, которые сдвинулись: по ним видно, **чем** оценка заплатила за потерю.
 *
 * Запуск:
 *   node bot/tools/leaf.js --heroes=anubis,medusa
 *   node bot/tools/leaf.js --heroes=anubis,medusa --seed=12 --policy=search
 */
import { playDuel } from '../play/duel.js';
import { assistantImportance } from '../play/pool.js';
import { leafScore } from '../play/search.js';
import { featureNames, featuresOf, mechanicLoss, scaleOf, scoreOf } from '../play/value.js';
import trainedWeights from '../play/value-weights.js';

const numberArg = (name, fallback = null) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  if (found == null) return fallback;
  const value = Number(found.slice(name.length + 3));
  return Number.isFinite(value) ? value : fallback;
};
const stringArg = (name, fallback = null) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  return found == null ? fallback : found.slice(name.length + 3);
};

const seed = numberArg('seed', 7);
const policy = stringArg('policy', 'greedy');
const [heroA, heroB] = stringArg('heroes', 'anubis,medusa')
  .split(',')
  .map(value => value.trim());
const minStep = numberArg('min-step', 6);
const at = stringArg('at', 'last');

/**
 * Снимок партии — позиция, где у обеих сторон живы и герой, и помощник: на ней и меряем. `--at=first`
 * берёт первую такую (середина игры), по умолчанию — последнюю (позиция уже почти решена; по разнице
 * видно, как ведёт себя лист в решённой позиции). Копия обязательна: `onStep` отдаёт живое состояние.
 */
let firstSnapshot = null;
let snapshot = null;
let foundStep = 0;
let firstStep = 0;
const report = playDuel({
  seed,
  heroA,
  heroB,
  policy,
  onStep: ({ step, state }) => {
    if (step < minStep) return;
    const both = (state.players ?? []).every(
      player =>
        (player.fighters ?? []).some(fighter => fighter.type === 'hero' && fighter.currentHp > 0) &&
        (player.fighters ?? []).some(
          fighter => fighter.type === 'assistant' && fighter.currentHp > 0,
        ),
    );
    if (!both) return;
    if (firstSnapshot == null) {
      firstSnapshot = structuredClone(state);
      firstStep = step;
    }
    snapshot = structuredClone(state);
    foundStep = step;
  },
});

if (at === 'first' && firstSnapshot != null) {
  snapshot = firstSnapshot;
  foundStep = firstStep;
}

if (snapshot == null) {
  console.error(`позиция с двумя живыми помощниками не нашлась (сид ${seed}, ${heroA} против ${heroB})`);
  process.exit(1);
}

const playerOf = (state, heroId) => state.players.find(player => String(player.heroId) === heroId);
const fighterOf = (player, type) =>
  (player?.fighters ?? []).find(fighter => fighter.type === type && fighter.currentHp > 0) ?? null;
const variant = mutate => {
  const next = structuredClone(snapshot);
  mutate(next);
  return next;
};
const kill = (state, heroId, type) => {
  const target = fighterOf(playerOf(state, heroId), type);
  if (target != null) target.currentHp = 0;
  return target;
};
const shiftHero = (state, heroId, delta) => {
  const hero = fighterOf(playerOf(state, heroId), 'hero');
  if (hero != null) hero.currentHp = Math.max(1, hero.currentHp + delta);
  return hero;
};
/** Пелена Анубиса: предмет с состоянием; при смерти Амат оно гаснет на следующем НАЧАЛЕ ХОДА. */
const shroudOff = state => {
  const items = playerOf(state, 'anubis')?.items ?? [];
  const shroud = items.find(item => String(item.group ?? item.id) === 'shroud');
  if (shroud != null) shroud.state = 'inactive';
  return shroud != null;
};

/** Глаза того, чью оценку считаем: `scoreOf`/`leafScore` принимают id игрока. */
let viewerId = '';
/**
 * Сырая сумма модели до `tanh`. `scoreOf` сжимает её в `[-1, 1]`, и в решённой позиции (|сумма| > 3)
 * производная гаснет: любые ходы получают одинаковую оценку. Поэтому мерить надо до сжатия, иначе
 * проба показывает шум сжатия, а не оценку. В сумму входит и выключатель пака (`mechanicLoss`): это её
 * часть, хотя и не выученная.
 */
const rawOf = state => {
  const features = featuresOf(state, viewerId);
  const weighted = featureNames.reduce(
    (total, name, index) => total + (Number(trainedWeights[name]) || 0) * features[index],
    0,
  );
  return weighted + mechanicLoss(state, viewerId);
};
const net = state => scoreOf(state, viewerId, trainedWeights);
const manual = state => leafScore(state, viewerId);
const round = value => Math.round(value * 1000) / 1000;
/** Взнос признака в сдвиг: разница вектора на вес. По нему видно, за счёт чего оценка изменилась. */
const moved = (before, after) => {
  const left = featuresOf(before, viewerId);
  const right = featuresOf(after, viewerId);
  return featureNames
    .map((name, index) => ({
      name,
      delta: right[index] - left[index],
      weight: Number(trainedWeights[name]) || 0,
      impact: (right[index] - left[index]) * (Number(trainedWeights[name]) || 0),
    }))
    .filter(entry => Math.abs(entry.impact) > 0.005)
    .sort((left, right2) => Math.abs(right2.impact) - Math.abs(left.impact))
    .slice(0, 4)
    .map(entry => `${entry.name} ${entry.delta > 0 ? '+' : ''}${round(entry.delta)} × ${round(entry.weight)} = ${round(entry.impact)}`)
    .join('; ');
};

const info = [heroA, heroB].map(heroId => {
  const player = playerOf(snapshot, heroId);
  const assistant = fighterOf(player, 'assistant');
  return {
    heroId,
    hp: fighterOf(player, 'hero')?.currentHp ?? 0,
    assistant: assistant == null ? null : { group: String(assistant.group), hp: assistant.currentHp },
  };
});

console.log(
  `проба листа: ${heroA} против ${heroB}, сид ${seed}, политика ${policy}, шаг ${foundStep}` +
    ` (в партии ${report.status}, шагов ${report.steps})`,
);
for (const entry of info) {
  const importance =
    entry.assistant == null ? 'нет помощника' : round(assistantImportance(entry.heroId, entry.assistant.group));
  console.log(
    `  ${entry.heroId}: герой ${entry.hp} hp; помощник ${entry.assistant?.group ?? '—'} ` +
      `${entry.assistant?.hp ?? 0} hp; важность ${importance}`,
  );
}

/** Меряем глазами каждой стороны: у одного гибнет свой помощник, у другого — чужой. */
for (const viewer of [heroA, heroB]) {
  const rival = viewer === heroA ? heroB : heroA;
  const me = playerOf(snapshot, viewer);
  const foe = playerOf(snapshot, rival);
  viewerId = String(me.id);
  const base = snapshot;
  const baseRaw = rawOf(base);
  const baseNet = net(base);
  const baseManual = manual(base);
  // цена одного здоровья героя — общая линейка для всех сдвигов ниже (считается по сырой сумме)
  const perHp = Math.abs(rawOf(variant(next => shiftHero(next, viewer, 1))) - baseRaw) || 1;

  const rows = [
    {
      title: `погиб мой помощник (${info.find(e => e.heroId === viewer)?.assistant?.group ?? '—'})`,
      state: variant(next => kill(next, viewer, 'assistant')),
    },
    {
      title: 'погибла Амат и пелена погасла (как на следующем НАЧАЛЕ ХОДА)',
      state: variant(next => {
        kill(next, 'anubis', 'assistant');
        shroudOff(next);
      }),
      only: [heroA, heroB].includes('anubis'),
    },
    {
      title: `погиб чужой помощник (${info.find(e => e.heroId === rival)?.assistant?.group ?? '—'})`,
      state: variant(next => kill(next, rival, 'assistant')),
    },
    {
      title: 'мой герой +2 hp (размен: помощник против здоровья)',
      state: variant(next => shiftHero(next, viewer, 2)),
    },
    {
      title: 'мой помощник погиб, мой герой +2 hp',
      state: variant(next => {
        kill(next, viewer, 'assistant');
        shiftHero(next, viewer, 2);
      }),
    },
  ].filter(row => row.only !== false);

  const compressed = Math.abs(baseRaw) > 3;
  console.log(
    `\nглазами ${viewer} (${foe.heroId} — соперник): сырая сумма ${round(baseRaw)}, ` +
      `лист ${round(baseNet)}${compressed ? ' — |сумма| за 3, tanh сжат' : ''}; ` +
      `шкала ${scaleOf(trainedWeights)}, 1 hp героя = ${round(perHp)} сырых`,
  );
  for (const row of rows) {
    const raw = rawOf(row.state);
    const score = net(row.state);
    const plain = manual(row.state);
    console.log(
      `  ${row.title}: ${round(raw)} (${raw - baseRaw > 0 ? '+' : ''}${round(raw - baseRaw)}, ` +
        `${round((raw - baseRaw) / perHp)} hp героя; лист ${score - baseNet > 0 ? '+' : ''}` +
        `${round(score - baseNet)}; ручная ${plain - baseManual > 0 ? '+' : ''}${round(plain - baseManual)})`,
    );
    const why = moved(base, row.state);
    if (why !== '') console.log(`      сдвинулось: ${why}`);
  }
}
