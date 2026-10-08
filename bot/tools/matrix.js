#!/usr/bin/env node
/**
 * Матрица матчапов: каждая упорядоченная пара героев пула играет одну и ту же серию сидов, поэтому
 * винрейты пар сравнимы между собой. Печатает markdown — таблицу «кто кого» и сводку по каждому
 * герою (винрейт, длина, урон, покрытие колоды, распределение действий): её переносят в
 * `docs/hero-balance.md`, а не пересказывают.
 *
 * Запуск: `pnpm test:matrix`, быстрая проверка — `pnpm test:matrix -- --games=20`,
 * пара героев — `--heroes=anubis,tesla`, другой набор сидов — `--from=500`,
 * политики сторон — `--policy=greedy --policy-b=random` (так меряется «лестница»: насколько
 * осмысленная игра сильнее случайной; замер идёт в обе стороны, поэтому времени вдвое больше).
 */
import {
  firstSeatWins,
  heroesTable,
  ladderAggregateLine,
  ladderLine,
  matrixTable,
  noiseMargin,
  runMatrix,
  seatLine,
  totalsLine,
  turnsLine,
} from './matchup.js';
import { policyNames } from '../play/policy.js';
import { runMatrixParallel } from '../learn/parallel.js';
import { matchups, heroIds as poolHeroIds } from '../play/pool.js';
import { failuresOf, groupByReason, plural, showReport } from './sweep.js';

/** Числовой флаг вида `--имя=значение`. */
const numberArg = (name, fallback = null) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  if (found == null) return fallback;
  const value = Number(found.slice(name.length + 3));
  return Number.isFinite(value) ? value : fallback;
};

/** Строковый флаг вида `--имя=значение`. */
const stringArg = (name, fallback = null) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  return found == null ? fallback : found.slice(name.length + 3);
};

/** Политика по флагу: опечатка должна падать, а не тихо превращаться в `random`. */
const policyArg = (name, fallback) => {
  const value = stringArg(name, fallback);
  if (!policyNames.includes(value)) {
    console.error(`--${name}: неизвестная политика "${value}" (нужны ${policyNames.join(' | ')})`);
    process.exit(1);
  }
  return value;
};

const games = numberArg('games', 200);
const from = numberArg('from', 1);
const maxSteps = numberArg('max-steps', null);
const workers = numberArg('workers', 1);
const mapId = stringArg('map', 'generated');
const policy = policyArg('policy', 'greedy');
const policyB = stringArg('policy-b') == null ? null : policyArg('policy-b', policy);
const requested = (stringArg('heroes') ?? '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const unknown = requested.filter(heroId => !poolHeroIds.includes(heroId));
if (unknown.length > 0) {
  console.error(`неизвестные герои: ${unknown.join(', ')} (в контенте: ${poolHeroIds.join(', ')})`);
  process.exit(1);
}
if (requested.length === 1) {
  console.error('--heroes: для матрицы нужны минимум два героя, например --heroes=anubis,tesla');
  process.exit(1);
}

const heroes = requested.length === 0 ? poolHeroIds : requested;
const seeds = Array.from({ length: Math.max(1, games) }, (_, index) => from + index);

console.log(
  `матрица матчапов: героев ${heroes.length}, пар ${matchups(heroes).length}, ` +
    `по ${plural(seeds.length, ['партии', 'партиям', 'партиям'])} на пару ` +
    `(сиды ${seeds[0]}…${seeds[seeds.length - 1]}), поле ${mapId}, ` +
    `политика ${policy}${policyB ? ` против ${policyB} (в обе стороны)` : ''}, ` +
    `${maxSteps ? `лимит партии ${maxSteps} шагов, ` : ''}` +
    `${workers > 1 ? `воркеров ${workers}, ` : ''}` +
    `шум ±${noiseMargin(seeds.length).toFixed(1)}%`,
);

const started = Date.now();

/**
 * Партии независимы, поэтому с дорогой политикой (поиск) их считают воркеры: `--workers=N` делит
 * одну и ту же серию сидов между ядрами. По умолчанию всё считается в текущем процессе.
 */
const parallel =
  workers > 1
    ? await runMatrixParallel({ heroes, seeds, mapId, policy, policyB, maxSteps, workers })
    : null;
const pairResults = parallel
  ? parallel.pairResults
  : runMatrix({ heroes, seeds, mapId, policy, policyB, maxSteps }).pairResults;
const reports = pairResults.flatMap(pair => pair.reports);

/**
 * Лестница меряется в обе стороны: политика первого места сама по себе выигрывает 54–61%, поэтому
 * односторонний замер показывает место, а не силу политики. Встречный прогон — та же серия сидов с
 * политиками, поменянными местами (`policy` играет вторым).
 */
const mirrorPairs = parallel
  ? parallel.mirrorPairs
  : policyB
    ? runMatrix({ heroes, seeds, mapId, policy: policyB, policyB: policy, maxSteps }).pairResults
    : null;
if (mirrorPairs) reports.push(...mirrorPairs.flatMap(pair => pair.reports));

const failures = failuresOf(reports);

console.log(`\n## Матрица матчапов (винрейт героя строки)\n`);
console.log(matrixTable(pairResults, heroes));
console.log(`\n## Герои\n`);
console.log(heroesTable(reports, heroes));
console.log(`\n${totalsLine(reports)}`);
console.log(turnsLine(reports));
console.log(seatLine(reports));
if (policyB) {
  console.log(ladderLine(pairResults, policy, policyB));
  console.log(
    ladderAggregateLine(firstSeatWins(pairResults), firstSeatWins(mirrorPairs), policy, policyB),
  );
}
console.log(
  '`!` — выход за коридор: матчап 30–70%, средний винрейт героя 40–60%; ' +
    'пометка «эталон» — Медуза и Тесла, по ним равняются наши герои. ' +
    'Действия считаются кликами: маневр — это клик на объявление плюс клик на каждый шаг, ' +
    'поэтому доля перемещения у ходящего бота высокая',
);
console.log(`время: ${((Date.now() - started) / 1000).toFixed(1)} с`);

if (failures.length > 0) {
  console.error(`\nнаходок ${failures.length}:`);
  // по видам, а не по порядку: на длинной серии одно и то же падение приходит сотни раз
  for (const [reason, found] of groupByReason(failures)) {
    console.error(`\n[${found.length}×] ${reason}`);
    for (const report of found.slice(0, 2)) console.error(showReport(report));
  }
  process.exit(1);
}
