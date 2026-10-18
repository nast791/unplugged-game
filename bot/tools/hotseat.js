#!/usr/bin/env node
/**
 * Прогон стола на четверых людей (hotseat) — ищет баги за общим экраном.
 * Запуск: `node bot/tools/hotseat.js`, длинная серия — `node bot/tools/hotseat.js --games=500`.
 *
 * Флаги: `--games=200` сколько партий, `--from=100` с какого сида, `--seed=50` разобрать одну партию,
 * `--players=4` сколько мест (2–4), `--steps=1500` лимит шагов, `--mode=table` режим стола
 * (`table` — «Одиночный режим» лобби, `hotseat` — все люди). Сид воспроизводим: партия повторяется
 * один в один, в отчёте — лог последних действий.
 *
 * Что считается находкой: падение (`crash`), тупик (`deadlock`), нарушенный инвариант (`invalid`)
 * и утечка проекции (`view` — смотрящий увидел чужую руку, колоду или чужую расстановку).
 * `stuck` и `noop` попадают в отчёт, но прогон не роняют: лимит шагов — свойство случайного хода.
 */
import { groupByReason, plural, showReport } from './sweep.js';
import { playHotseat } from '../play/hotseat.js';

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

const FAILING = ['crash', 'deadlock', 'invalid', 'view', 'reject', 'foreign'];

const single = numberArg('seed');
const count = Math.max(1, numberArg('games', 60));
const from = numberArg('from', 1);
const players = Math.min(4, Math.max(2, numberArg('players', 4)));
const maxSteps = numberArg('steps', 1500);
const mode = stringArg('mode', 'table');
const seeds = single == null ? Array.from({ length: count }, (_, index) => from + index) : [single];

console.log(
  `прогон стола: ${plural(players, ['место', 'места', 'мест'])} за одним экраном, режим ${mode}, ` +
    `${plural(seeds.length, ['партия', 'партии', 'партий'])}` +
    (seeds.length > 1 ? `, сиды ${seeds[0]}…${seeds[seeds.length - 1]}` : `, сид ${seeds[0]}`),
);

const started = Date.now();
const reports = [];
for (const [index, seed] of seeds.entries()) {
  try {
    reports.push(playHotseat({ seed, players, maxSteps, mode }));
  } catch (error) {
    reports.push({
      status: 'invalid',
      seed,
      steps: 0,
      log: [],
      detail: `исключение вне партии: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  if ((index + 1) % 10 === 0 || index + 1 === seeds.length) {
    process.stderr.write(`\rсыграно ${index + 1}/${seeds.length}`);
  }
}
process.stderr.write('\n');

const summary = reports.reduce((acc, report) => {
  acc[report.status] = (acc[report.status] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `до конца ${summary.finished ?? 0}, не завершились ${summary.stuck ?? 0}, ` +
    `падений ${summary.crash ?? 0}, тупиков ${summary.deadlock ?? 0}, ` +
    `нарушений инварианта ${summary.invalid ?? 0}, утечек проекции ${summary.view ?? 0}, ` +
    `пустых действий ${summary.noop ?? 0}`,
);

const failures = reports.filter(report => FAILING.includes(report.status));
for (const [reason, found] of groupByReason(failures)) {
  console.log(`\n[${found.length}×] ${reason}`);
  for (const report of found.slice(0, 3)) console.log(showReport(report));
}

console.log(`\nвремя: ${((Date.now() - started) / 1000).toFixed(1)} с`);
if (failures.length > 0) {
  console.error(`находок ${failures.length}: прогон не прошёл`);
  process.exit(1);
}
console.log('находок нет: стол дошёл до конца без падений, тупиков и утечек');
