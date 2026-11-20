#!/usr/bin/env node
/**
 * Аудит трасс обучения: сходятся ли знаки обученных весов с данными, на которых модель учили, и не
 * сжата ли оценка настолько, что различать листья уже нечем.
 *
 * Зачем. Вес признака читается только вместе с выборкой: `deck: -1.1` — это либо «в игре жечь колоду
 * выгодно», либо «обучение не сошлось». Здесь выборка пересобирается тем же путём, что у
 * `bot/learn/train.js` (`collectSamples`: позиция → признаки глазами ходящего, подпись → исход партии),
 * и для каждого спорного признака печатается, **что говорят данные** и **что думает модель**. Плюс
 * распределение сырой суммы до `tanh`: `scoreOf` сжимает её в `[-1, 1]`, и при |сумма| > 3 производная
 * гаснет — два разных листа получают одну оценку.
 *
 * Запуск:
 *   node bot/tools/trace.js --games=4 --workers=4
 *   node bot/tools/trace.js --games=6 --workers=8 --sample-every=6 --heroes=anubis,medusa,tesla
 *
 * `--games` — число сидов на пару героев; кто из пары ходит первым, решает чётность сида
 * (`bot/play/duel.js`), поэтому на наборе пар место сбалансировано само.
 */
import { runSampleGames } from '../learn/parallel.js';
import { heroIds as pool, matchups } from '../play/pool.js';
import { conditionedFeatures, featureNames, scaleOf } from '../play/value.js';
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

const seeds = Math.max(1, numberArg('games', 4));
const from = numberArg('from', 1);
const workers = numberArg('workers', 4);
const sampleEvery = Math.max(1, numberArg('sample-every', 4));
const requested = (stringArg('heroes') ?? '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const heroes = requested.length === 0 ? pool : requested;

const specs = [];
for (const { heroA, heroB } of matchups(heroes)) {
  for (let index = 0; index < seeds; index += 1) {
    specs.push({ seed: from + index, heroA, heroB, policy: 'search' });
  }
}

const collected = await runSampleGames(specs, { workers, sampleEvery });
const rows = collected.flat();
const finished = collected.filter(list => (list ?? []).length > 0).length;
if (rows.length === 0) {
  console.error('позиций нет: партии не дошли до конца');
  process.exit(1);
}

const indexOf = Object.fromEntries(featureNames.map((name, index) => [name, index]));
const weightOf = name => Number(trainedWeights[name]) || 0;
/** Сырая сумма модели: `scoreOf` берёт от неё `tanh`, поэтому сжатие видно только здесь. */
const rawOf = features =>
  featureNames.reduce((total, name, index) => total + weightOf(name) * features[index], 0);
/** Номер хода в партии: признак `round` — это `turn.index / 20`, поэтому домножаем обратно. */
const roundOf = features => Math.round((features[indexOf.round] ?? 0) * 20);

const won = rows.filter(row => row.label === 1);
const lost = rows.filter(row => row.label === 0);
const mean = (list, pick) => (list.length === 0 ? 0 : list.reduce((sum, row) => sum + pick(row), 0) / list.length);
const round2 = value => Math.round(value * 100) / 100;

const raw = rows.map(row => rawOf(row.features));
const absolute = raw.map(Math.abs);
const share = limit => absolute.filter(value => value > limit).length / absolute.length;
console.log(
  `позиций ${rows.length} из ${finished}/${specs.length} партий (сиды ${from}…${from + seeds - 1}, ` +
    `каждая ${sampleEvery}-я, политика search); побед ${won.length}, поражений ${lost.length}`,
);
const averageAbsolute = mean(rows, row => Math.abs(rawOf(row.features)));
const scale = scaleOf(trainedWeights);
const scaledShare = limit => absolute.filter(value => value / scale > limit).length / absolute.length;
const percentile = share => absolute.slice().sort((left, right) => left - right)[Math.floor(absolute.length * share)] ?? 0;
console.log(
  `сырая сумма до tanh: средняя |сумма| ${round2(averageAbsolute)}, ` +
    `|сумма| > 1: ${Math.round(share(1) * 100)}%, > 3 (сжатие мёртвое): ${Math.round(share(3) * 100)}%, ` +
    `> 5: ${Math.round(share(5) * 100)}%`,
);
console.log(
  `температура листа: ${scale}; после деления |сумма| > 1: ${Math.round(scaledShare(1) * 100)}%, ` +
    `> 3: ${Math.round(scaledShare(3) * 100)}%; калибровка по этой выборке дала бы ` +
    `${round2(percentile(0.9) / 1.5)} (90-й процентиль / 1,5)`,
);

/** Спорные признаки: те, чей знак в артефакте выглядит противоречащим правилам игры. */
const watched = [
  'heroHp',
  'deck',
  'thinDeck',
  'resource',
  'resourceOn',
  'resourceShare',
  'resourceStep',
  'distance',
  'reach',
  'assistants',
  'sidekickHp',
  'hand',
  'handEffects',
];
console.log('\nпризнак: что говорят данные (средний у победителей минус у проигравших) против веса модели');
console.log('  (совпадает — знак веса такой же, как у данных; НЕТ — модель учит обратное выборке)');
for (const name of watched) {
  const index = indexOf[name];
  const delta = mean(won, row => row.features[index]) - mean(lost, row => row.features[index]);
  const weight = weightOf(name);
  const agrees = Math.sign(delta) === Math.sign(weight) || delta === 0 ? 'да' : 'НЕТ';
  console.log(
    `  ${name.padEnd(14)} данные ${String(round2(delta)).padStart(7)}  вес ${String(round2(weight)).padStart(7)}  ` +
      `совпадает: ${agrees}`,
  );
}

/**
 * Условные признаки (`conditionedFeatures`) учатся **на пару с героем**: вес такого признака — это база
 * плюс `@<герой>`, поэтому сравнивать базовый вес с данными по всем героям сразу нельзя. Здесь то же
 * сравнение, но внутри одного героя и с его собственным весом: видно, что осталось расхождением.
 */
const conditioned = new Set(conditionedFeatures);
console.log('\nусловные признаки по героям: данные против эффективного веса (база + @герой)');
for (const name of watched.filter(entry => conditioned.has(entry))) {
  const index = indexOf[name];
  const parts = [];
  for (const heroId of pool) {
    const heroIndex = indexOf[`hero:${heroId}`];
    if (heroIndex == null) continue;
    const wins = won.filter(row => row.features[heroIndex] === 1);
    const losses = lost.filter(row => row.features[heroIndex] === 1);
    if (wins.length < 10 || losses.length < 10) continue;
    const delta = mean(wins, row => row.features[index]) - mean(losses, row => row.features[index]);
    const weight = weightOf(name) + weightOf(`${name}@${heroId}`);
    if (Math.sign(delta) === Math.sign(weight) || delta === 0) continue;
    parts.push(`${heroId}: данные ${round2(delta)} против веса ${round2(weight)}`);
  }
  console.log(`  ${name}: ${parts.length === 0 ? 'расхождений нет' : parts.join('; ')}`);
}

/** То же внутри одного хода: без этого «победитель впереди по колоде» может быть просто разной длиной. */
console.log('\nвнутри одного хода (корзины по номеру хода), признак: победитель минус проигравший');
const buckets = [
  { title: 'ходы 1–10', from: 1, to: 10 },
  { title: 'ходы 11–20', from: 11, to: 20 },
  { title: 'ходы 21–30', from: 21, to: 30 },
  { title: 'ходы 31+', from: 31, to: Infinity },
];
const inside = (list, bucket) =>
  list.filter(row => roundOf(row.features) >= bucket.from && roundOf(row.features) <= bucket.to);
for (const bucket of buckets) {
  const wins = inside(won, bucket);
  const losses = inside(lost, bucket);
  if (wins.length === 0 || losses.length === 0) {
    console.log(`  ${bucket.title}: позиций мало (${wins.length} / ${losses.length})`);
    continue;
  }
  const parts = ['deck', 'thinDeck', 'resource', 'resourceShare', 'distance', 'reach'].map(name => {
    const index = indexOf[name];
    const delta = mean(wins, row => row.features[index]) - mean(losses, row => row.features[index]);
    return `${name} ${delta > 0 ? '+' : ''}${round2(delta)}`;
  });
  console.log(`  ${bucket.title} (${wins.length} / ${losses.length}): ${parts.join(', ')}`);
}
