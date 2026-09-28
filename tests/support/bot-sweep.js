#!/usr/bin/env node
/**
 * Ручной прогон фаззинг-бота: бот сам играет дуэль Медуза против Теслы и ищет баги.
 * Запуск: `pnpm test:bot`, длинная серия — `pnpm test:bot -- --seeds=2000`.
 *
 * Флаги: `--seeds=2000` сколько партий, `--from=100` с какого сида начать,
 * `--seed=50` разобрать одну партию по сиду, `--map=generated` играть на поле, собранном генератором
 * (по умолчанию `arena`). Сид воспроизводим: партия повторяется один в один,
 * а в отчёте есть лог последних действий — по нему баг ловится заново.
 * `FUZZ_SEEDS` работает так же, как `--seeds`, если флаг не задан.
 */
import { describeSweep, plural, runSweep } from './duel-sweep.js';

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

const single = numberArg('seed');
const count = numberArg('seeds') ?? (Number(process.env.FUZZ_SEEDS) || 60);
const from = numberArg('from', 1);
const mapId = stringArg('map', 'arena');
const seeds =
  single == null
    ? Array.from({ length: Math.max(1, count) }, (_, index) => from + index)
    : [single];

console.log(
  `фаззинг дуэли: ${plural(seeds.length, ['партия', 'партии', 'партий'])}` +
    (seeds.length > 1 ? `, сиды ${seeds[0]}…${seeds[seeds.length - 1]}` : `, сид ${seeds[0]}`) +
    `, поле ${mapId}`,
);

const started = Date.now();
const reports = runSweep(seeds, { mapId });
const { lines, failures } = describeSweep(reports);

for (const line of lines) console.log(line);
console.log(`\nвремя: ${((Date.now() - started) / 1000).toFixed(1)} с`);

if (failures.length > 0) {
  console.error(`находок ${failures.length}: прогон не прошёл`);
  process.exit(1);
}

console.log('находок нет: все партии дошли до конца');
