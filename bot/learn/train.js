#!/usr/bin/env node
/**
 * Обучение оценки на трассах поиска: экспертная итерация в миниатюре.
 *
 * 1. Самоиграет дорогая политика (`--policy=search`, обе стороны), партии пишутся выборкой позиций.
 * 2. Каждая позиция подписана исходом партии для того, кто в ней ходит: «я выиграл» / «я проиграл».
 * 3. Линейная модель (`bot/play/value.js`) учится отличать одно от другого — логистическая регрессия
 *    с L2-штрафом и обычным градиентным спуском.
 * 4. Качество проверяется на **других позициях** (каждая пятая не участвует в обучении), чтобы
 *    переобучение было видно.
 *
 * Партии считаются в воркерах (`--workers=N`), потому что партия с поиском стоит секунды: 300 партий
 * в одном процессе — это 21 минута, на восьми ядрах — около двух.
 *
 * Результат — `bot/play/value-weights.js`; поиск берёт его при `SEARCH_EVAL=net`.
 *
 * Запуск: `node bot/learn/train.js --games=300 --epochs=400 --workers=8`
 */
import { writeFileSync } from 'node:fs';
import { matchups, heroIds as pool, referenceHeroIds } from '../play/pool.js';
import { runSampleGames } from './parallel.js';
import { baseFeatureNames, featureNames } from '../play/value.js';
import { projectPair } from '../play/matchups.js';

const numberArg = (name, fallback) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  const value = found == null ? Number.NaN : Number(found.slice(name.length + 3));
  return Number.isFinite(value) ? value : fallback;
};
const stringArg = (name, fallback) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  return found == null ? fallback : found.slice(name.length + 3);
};

const games = Math.max(1, numberArg('games', 300));
const epochs = Math.max(1, numberArg('epochs', 400));
const rate = numberArg('rate', 0.5);
const l2 = numberArg('l2', 0.001);
const policy = stringArg('policy', 'search');
const sampleEvery = Math.max(1, numberArg('sample-every', 2));
const from = Math.max(1, numberArg('from', 1));
const workers = Math.max(0, numberArg('workers', 0));
const requested = stringArg('heroes', '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const heroes = requested.length > 0 ? requested : pool;
const pairs = matchups(heroes);

/** Задания на партии: пара героев по кругу, сид сдвигается на каждом обходе. */
const specs = Array.from({ length: games }, (_, index) => {
  const pair = pairs[index % pairs.length];
  return {
    seed: from + Math.floor(index / pairs.length),
    heroA: pair.heroA,
    heroB: pair.heroB,
    policy,
    policyB: policy,
  };
});

const started = Date.now();
const rows = [];
// партии идут порциями: так прогресс виден и в прогоне воркерами, и в одном процессе
const chunkSize = Math.max(1, numberArg('chunk', 25));

for (let start = 0; start < specs.length; start += chunkSize) {
  const part = specs.slice(start, start + chunkSize);
  const collected = await runSampleGames(part, { workers, sampleEvery });
  for (const samples of collected) rows.push(...(samples ?? []));
  console.log(
    `  партий ${Math.min(start + chunkSize, specs.length)}/${specs.length}, позиций ${rows.length}`,
  );
}

console.log(
  `позиций ${rows.length} из ${games} партий за ${((Date.now() - started) / 1000).toFixed(0)} с ` +
    `(воркеров ${workers > 0 ? workers : 'по умолчанию'}, эталоны ${referenceHeroIds.join(', ')} в выборке)`,
);
if (rows.length === 0) {
  console.error('нет данных: партии не дошли до конца');
  process.exit(1);
}

/** Удержанная выборка — каждая пятая позиция: по ней видно переобучение. */
const holdout = rows.filter((_, index) => index % 5 === 0);
const train = rows.filter((_, index) => index % 5 !== 0);

const weights = Object.fromEntries(featureNames.map(name => [name, 0]));
const sigmoid = value => 1 / (1 + Math.exp(-value));
const dot = features =>
  featureNames.reduce((total, name, index) => total + weights[name] * features[index], 0);
const accuracy = set =>
  set.length === 0
    ? 0
    : set.filter(row => (dot(row.features) > 0 ? 1 : 0) === row.label).length / set.length;

for (let epoch = 0; epoch < epochs; epoch += 1) {
  for (const row of train) {
    const error = sigmoid(dot(row.features)) - row.label;
    featureNames.forEach((name, index) => {
      weights[name] -= rate * (error * row.features[index] + l2 * weights[name]);
    });
  }
  if ((epoch + 1) % 100 === 0) {
    console.log(
      `  эпоха ${epoch + 1}: обучение ${(accuracy(train) * 100).toFixed(1)}%, ` +
        `проверка ${(accuracy(holdout) * 100).toFixed(1)}%`,
    );
  }
}

console.log('\nвеса базовых признаков:');
for (const name of featureNames.filter(entry => !entry.includes(':') && !entry.includes('@'))) {
  console.log(`  ${name}: ${weights[name].toFixed(3)}`);
}
console.log(
  `\nвеса героев (${featureNames.length - baseFeatureNames.length} признаков) — в bot/play/value-weights.js`,
);
console.log(
  `\nитог: обучение ${(accuracy(train) * 100).toFixed(1)}%, проверка ${(accuracy(holdout) * 100).toFixed(1)}% ` +
    `(позиций ${train.length} / ${holdout.length})`,
);

/** Оценке нужен диапазон `[-1, 1]`, а веса обучены на вероятностях: домножаем на 2 (внутри — `tanh`). */
const scaled = featureNames.map(
  name => `  ${JSON.stringify(name)}: ${Math.round(weights[name] * 2 * 1000) / 1000},`,
);

writeFileSync(
  new URL('../play/value-weights.js', import.meta.url),
  [
    '/**',
    ' * Веса оценки (`bot/play/value.js`), обученные `bot/learn/train.js` на трассах поиска.',
    ` * Выборка: ${train.length} позиций обучения и ${holdout.length} проверки, точность на удержанных`,
    ` * позициях ${(accuracy(holdout) * 100).toFixed(1)}%. Файл перезаписывается обучением.`,
    ' */',
    'export default {',
    ...scaled,
    '};',
    '',
  ].join('\n'),
  'utf8',
);
console.log('записано: bot/play/value-weights.js');

/**
 * Матрица матчапов: проекция той же модели на пару «мой герой против этого соперника». Внутри пары
 * индикаторы героя и соперника постоянны, поэтому оценка сводится к коэффициентам базовых признаков
 * плюс константа — артефакт точный (проверяет `tests/unit/bot/matchups.test.js`), а не приблизительный.
 * Пишется дважды: `bot/play/matchups.json` для чтения и `bot/play/matchup-weights.js` как зеркало для бандла.
 */
const matchupTable = {};
for (const mine of pool) {
  for (const rival of pool) {
    if (mine === rival) continue;
    const projected = projectPair(weights, mine, rival);
    matchupTable[mine] ??= { vs: {} };
    matchupTable[mine].vs[rival] = {
      constant: Math.round(projected.constant * 2 * 1000) / 1000,
      weights: Object.fromEntries(
        Object.entries(projected.weights).map(([name, value]) => [
          name,
          Math.round(value * 2 * 1000) / 1000,
        ]),
      ),
    };
  }
}

const meta = {
  games,
  positions: rows.length,
  train: train.length,
  holdout: holdout.length,
  accuracy: Math.round(accuracy(holdout) * 1000) / 1000,
  features: featureNames.length,
  policy,
  heroes: pool,
};
const table = { meta, pairs: matchupTable };

writeFileSync(
  new URL('../play/matchups.json', import.meta.url),
  `${JSON.stringify(table, null, 2)}\n`,
  'utf8',
);
writeFileSync(
  new URL('../play/matchup-weights.js', import.meta.url),
  [
    '/**',
    ' * Матрица матчапов — зеркало `bot/play/matchups.json` для бандла (в браузере нет `fs`).',
    ' * Файл **перезаписывается** обучением (`node bot/learn/train.js`): править руками нечего.',
    ' */',
    `export default ${JSON.stringify(table, null, 2)};`,
    '',
  ].join('\n'),
  'utf8',
);
console.log(
  `записано: bot/play/matchups.json и bot/play/matchup-weights.js (пар ${Object.keys(matchupTable).length * (pool.length - 1)})`,
);
