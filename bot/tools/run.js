#!/usr/bin/env node
/**
 * Ручной прогон бота: он сам играет дуэль выбранной пары героев и ищет баги.
 * Запуск: `pnpm test:bot`, длинная серия — `pnpm test:bot -- --seeds=2000`.
 *
 * Флаги: `--seeds=2000` сколько партий, `--from=100` с какого сида начать,
 * `--seed=50` разобрать одну партию по сиду, `--heroes=anubis,tesla` — пара героев из контента
 * (по умолчанию эталонная Медуза против Теслы), `--map=generated` — поле (сейчас это единственный
 * вариант: фиксированных карт в контенте нет), `--policy=greedy` — политика первого игрока,
 * `--policy-b=random` — второго (по умолчанию та же). Сид воспроизводим: партия повторяется один
 * в один, а в отчёте есть лог последних действий — по нему баг ловится заново.
 * `FUZZ_SEEDS` работает так же, как `--seeds`, если флаг не задан.
 *
 * Политики: `random` — фаззинг (им ищем баги), `greedy` — осмысленная игра (ею меряем метрики).
 * Матрица «все против всех» — `pnpm test:matrix` (`bot/tools/matrix.js`).
 */
import { policyNames } from '../play/policy.js';
import { describeSweep, plural, runSweep } from './sweep.js';

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

const single = numberArg('seed');
const count = numberArg('seeds') ?? (Number(process.env.FUZZ_SEEDS) || 60);
const from = numberArg('from', 1);
const mapId = stringArg('map', 'generated');
const policy = policyArg('policy', 'random');
const policyB = stringArg('policy-b') == null ? null : policyArg('policy-b', policy);
const [heroA, heroB] = (stringArg('heroes', 'medusa,tesla') ?? '').split(',');
if (!heroA || !heroB) {
  console.error('--heroes: нужна пара героев, например --heroes=anubis,tesla');
  process.exit(1);
}
const seeds =
  single == null
    ? Array.from({ length: Math.max(1, count) }, (_, index) => from + index)
    : [single];

console.log(
  `фаззинг дуэли: ${heroA} против ${heroB}, ` +
    `${plural(seeds.length, ['партия', 'партии', 'партий'])}` +
    (seeds.length > 1 ? `, сиды ${seeds[0]}…${seeds[seeds.length - 1]}` : `, сид ${seeds[0]}`) +
    `, поле ${mapId}, политика ${policy}${policyB ? ` против ${policyB}` : ''}`,
);

const started = Date.now();
const reports = runSweep(seeds, { mapId, heroA, heroB, policy, policyB });
const { lines, failures } = describeSweep(reports);

for (const line of lines) console.log(line);
console.log(`\nвремя: ${((Date.now() - started) / 1000).toFixed(1)} с`);

if (failures.length > 0) {
  console.error(`находок ${failures.length}: прогон не прошёл`);
  process.exit(1);
}

console.log('находок нет: все партии дошли до конца');
