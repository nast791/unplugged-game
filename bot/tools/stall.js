#!/usr/bin/env node
/**
 * Замер «партия не тянется»: длина партии, доля партий без первого убийства (истощение) и исход
 * «агрессивный против обычного». Нужен потому, что винрейт этого не показывает: политика может держать
 * 50% и при этом **отсиживаться** — партия идёт 200 действий и кончается истощением, а живой игрок,
 * который просто идёт вперёд и бьёт, ломает такую игру.
 *
 * Запуск:
 *   node bot/tools/stall.js --games=40 --policy=random --policy-b=greedy
 *   node bot/tools/stall.js --games=40 --policy=aggressive --policy-b=greedy
 */
import { playDuel } from '../play/duel.js';
import { runGamesParallel } from '../learn/parallel.js';
import { heroIds as poolHeroIds, matchups } from '../play/pool.js';
import { percent } from '../play/metrics.js';

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

const games = numberArg('games', 40);
const from = numberArg('from', 1);
const workers = numberArg('workers', 1);
const maxSteps = numberArg('max-steps', null);
const policy = stringArg('policy', 'greedy');
const policyB = stringArg('policy-b', null);
const requested = (stringArg('heroes') ?? '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const unknown = requested.filter(heroId => !poolHeroIds.includes(heroId));
if (unknown.length > 0) {
  console.error(`неизвестные герои: ${unknown.join(', ')} (в контенте: ${poolHeroIds.join(', ')})`);
  process.exit(1);
}

const heroes = requested.length === 0 ? poolHeroIds : requested;
const seeds = Array.from({ length: Math.max(1, games) }, (_, index) => from + index);

// каждая пара играется дважды: политика `policy` ходит первой и второй, поэтому место сокращается
const specs = [];
for (const { heroA, heroB } of matchups(heroes)) {
  for (const seed of seeds) {
    const base = { seed, heroA, heroB, ...(maxSteps == null ? {} : { maxSteps }) };
    specs.push(
      { ...base, policy, ...(policyB == null ? {} : { policyB }) },
      { ...base, policy: policyB ?? policy, policyB: policy },
    );
  }
}

const reports = (
  workers > 1 ? await runGamesParallel(specs, { workers }) : specs.map(spec => playDuel(spec))
).filter(Boolean);

const finished = reports.filter(report => report.status === 'finished');
const stuck = reports.filter(report => report.status === 'stuck').length;
const broken = reports.filter(report =>
  ['crash', 'deadlock', 'invalid'].includes(report.status),
).length;
const lengths = finished.map(report => report.steps).sort((left, right) => left - right);
const median = lengths.length === 0 ? 0 : lengths[Math.floor(lengths.length / 2)];
const average =
  lengths.length === 0 ? 0 : lengths.reduce((sum, value) => sum + value, 0) / lengths.length;

/**
 * Конец партии по существу: победитель есть всегда, поэтому важно, **чем** он выиграл.
 * `killed` — у проигравшего не осталось живых бойцов (бой), `burned` — живые есть, значит смерть
 * пришла от истощения (пустая колода). Первое убийство в метриках для этого не годится: истощение
 * может убить того, кто уже успел кого-то убить.
 */
const deathKind = report => {
  const winner = String(report.state?.winner);
  const loser = (report.state?.players ?? []).find(player => String(player.id) !== winner);
  const aliveFighters = (loser?.fighters ?? []).filter(fighter => Number(fighter.currentHp) > 0);
  return { killed: aliveFighters.length === 0, deck: loser?.deck?.cards?.length ?? 0 };
};

const killed = finished.filter(report => deathKind(report).killed).length;
const burned = finished.length - killed;
const firstBlood = finished.filter(report => report.metrics?.firstBlood != null).length;

// Победы по политикам: политика ходит первой на нечётном сиде и второй на чётном, поэтому место
// взаимно сокращается. `playDuel` политику в отчёт не пишет, но порядок отчётов совпадает с порядком
// задач (`runGamesParallel` держит исходный порядок) — «кто был первым» берётся из задачи.
const wins = new Map();
for (let index = 0; index < specs.length; index += 1) {
  const spec = specs[index];
  const report = reports[index];
  if (report?.status !== 'finished') continue;
  const firstHero = Number(report.seed) % 2 === 0 ? spec.heroB : spec.heroA;
  const winner = String(report.state.winner);
  const firstPolicyWon = winner === String(firstHero);
  const winnerPolicy = firstPolicyWon ? spec.policy : spec.policyB;
  wins.set(winnerPolicy, (wins.get(winnerPolicy) ?? 0) + 1);
}

console.log(
  `партий ${reports.length}: до конца ${finished.length}, застряло ${stuck}, падений ${broken}`,
);
console.log(
  `длина: медиана ${median}, средняя ${average.toFixed(0)}, минимум ${lengths[0] ?? 0}, максимум ${lengths[lengths.length - 1] ?? 0}`,
);
console.log(
  `конец партии: убийством ${killed} (${percent(killed, finished.length)}%), истощением ${burned} (${percent(burned, finished.length)}%), ` +
    `первое убийство зафиксировано в ${percent(firstBlood, finished.length)}%`,
);
for (const [name, count] of wins) {
  console.log(
    `  ${name}: ${percent(count, finished.length)}% побед (${count} из ${finished.length})`,
  );
}
