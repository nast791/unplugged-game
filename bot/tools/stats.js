#!/usr/bin/env node
/**
 * Замер «политика против политики» **по каждому герою**. Матрица матчапов (`bot/tools/matrix.js`)
 * отвечает на вопрос «кто кого»; здесь — **где именно** новая политика выигрывает, а где проигрывает,
 * чтобы приёмка и правки шли по героям, а не по среднему.
 *
 * Механика: та же серия сидов и те же пары героев играются дважды — сначала `--policy` ходит первым,
 * `--policy-b` вторым, потом наоборот (встречную серию считает `runMatrixParallel`). Считаются победы
 * **держателя политики** с разрезом по герою, которым он играл: место первого хода взаимно сокращается,
 * сила героя остаётся в обеих половинах одинаковой, поэтому разница винрейтов — это вклад политики.
 *
 * Запуск:
 *   node bot/tools/stats.js --games=60 --workers=12 --policy=qvalue --policy-b=greedy
 *   node bot/tools/stats.js --games=60 --workers=12 --policy=qthink --policy-b=greedy --depth=0,1,2,3
 * `--depth` задаёт `QVALUE_DEPTH` (через запятую — несколько глубин подряд; `QVALUE_TOP` — `--top`):
 * так «думанье» меряется на тех же сидах и в тот же день, что и прямая модель. `--max-steps` режет
 * длинные партии: у затянувшихся замер стоит вчетверо дороже, а в винрейт они всё равно не попадают.
 *
 * Зеркало (один и тот же герой с двух сторон) движок собрать не даёт — id игрока это id героя, —
 * поэтому «чистой» силы политики на герое тут нет; меряется её **прибавка к винрейту героя**, а это
 * ровно то, что решает приёмку.
 */
import { noiseMargin } from './matchup.js';
import { runMatrixParallel } from '../learn/parallel.js';
import { heroIds as poolHeroIds, heroName } from '../play/pool.js';
import { percent } from '../play/metrics.js';
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

const games = numberArg('games', 60);
const from = numberArg('from', 1);
const workers = numberArg('workers', 1);
const maxSteps = numberArg('max-steps', null);
const mapId = stringArg('map', 'generated');
const policy = stringArg('policy', 'qvalue');
const policyB = stringArg('policy-b', 'greedy');
const top = stringArg('top', null);
const depths = (stringArg('depth', '') ?? '')
  .split(',')
  .map(value => value.trim())
  .filter(value => value !== '');
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
if (heroes.length < 2) {
  console.error('--heroes: нужно минимум два героя');
  process.exit(1);
}

const seeds = Array.from({ length: Math.max(1, games) }, (_, index) => from + index);

/**
 * Победы держателя политики с разрезом по герою, которым он играл.
 *
 * `playDuel` отдаёт `policy` тому, кто ходит первым, а первым ходит `heroB` на чётном сиде и `heroA` на
 * нечётном. В основной серии политика занимает первое место, во встречной (`mirrorPairs`) — второе;
 * обе половины складываются, поэтому место взаимно сокращается. Партия попадает в таблицу ровно один
 * раз — под героем держателя, а не под победителем.
 */
const holderWins = (pairResults, mirrorPairs) => {
  const table = new Map();
  const note = (heroId, won) => {
    if (heroId == null) return;
    const row = table.get(String(heroId)) ?? { games: 0, wins: 0 };
    row.games += 1;
    if (won) row.wins += 1;
    table.set(String(heroId), row);
  };

  const collect = (pairs, holderIsFirst) => {
    for (const pair of pairs) {
      for (const report of pair.reports) {
        if (report.status !== 'finished') continue;
        // первым ходит heroB на чётном сиде и heroA на нечётном
        const firstHero = Number(report.seed) % 2 === 0 ? pair.heroB : pair.heroA;
        const holderHero = holderIsFirst
          ? firstHero
          : firstHero === pair.heroA
            ? pair.heroB
            : pair.heroA;
        note(holderHero, String(report.state.winner) === String(holderHero));
      }
    }
  };

  collect(pairResults, true);
  collect(mirrorPairs, false);
  return table;
};

/** Сумма побед и партий из таблицы по героям. */
const sumOf = table => {
  let wins = 0;
  let games = 0;
  for (const row of table.values()) {
    wins += row.wins;
    games += row.games;
  }
  return { wins, games };
};

/** Одна серия: политика `side` ходит первой, `other` — второй (и наоборот во встречной). */
const measure = async (label, side, other) => {
  const started = Date.now();
  const { pairResults, mirrorPairs } = await runMatrixParallel({
    heroes,
    seeds,
    mapId,
    policy: side,
    policyB: other,
    maxSteps: maxSteps ?? undefined,
    workers,
  });
  const reports = [
    ...pairResults.flatMap(pair => pair.reports),
    ...mirrorPairs.flatMap(pair => pair.reports),
  ];
  const byHero = holderWins(pairResults, mirrorPairs);
  const { wins, games: total } = sumOf(byHero);

  return {
    label,
    reports,
    wins,
    games: total,
    byHero,
    seconds: (Date.now() - started) / 1000,
  };
};

const table = (header, rows) =>
  [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map(cells => `| ${cells.join(' | ')} |`),
  ].join('\n');

/** Разница винрейтов держателя политики и держателя эталона на одном и том же наборе партий. */
const diffOf = (measured, baseline, heroId) => {
  const mine = measured.byHero.get(heroId) ?? { games: 0, wins: 0 };
  const theirs = baseline.byHero.get(heroId) ?? { games: 0, wins: 0 };
  const mineRate = mine.games === 0 ? 0 : (mine.wins / mine.games) * 100;
  const theirRate = theirs.games === 0 ? 0 : (theirs.wins / theirs.games) * 100;
  return { mine, theirs, mineRate, theirRate, delta: mineRate - theirRate };
};

/** Порог шума разницы двух винрейтов: оба посчитаны по своей серии партий. */
const deltaNoise = gamesPerHero => 1.96 * Math.sqrt((2 * 0.25) / Math.max(1, gamesPerHero)) * 100;

const runOne = async depth => {
  if (depth != null) process.env.QVALUE_DEPTH = String(depth);
  if (top != null) process.env.QVALUE_TOP = String(top);
  const label =
    depth == null ? policy : `${policy} (глубина ${depth}${top ? `, верхушка ${top}` : ''})`;

  console.log(`\n### ${label} против ${policyB}`);

  const main = await measure(label, policy, policyB);
  const base = await measure(policyB, policyB, policy);
  const perHero = Math.round(main.games / heroes.length);

  console.log(
    `\nпартий до конца: ${main.games} + ${base.games} (эталон), ` +
      `держатель политики взял **${percent(main.wins, main.games)}%** против ` +
      `${percent(base.wins, base.games)}% у держателя эталона ` +
      `за ${(main.seconds + base.seconds).toFixed(1)} с`,
  );

  const rows = heroes.map(heroId => {
    const { mine, theirs, mineRate, theirRate, delta } = diffOf(main, base, heroId);
    const sign = delta >= 0 ? '+' : '';
    return [
      heroName(heroId),
      `${mineRate.toFixed(0)}% (${mine.wins}/${mine.games})`,
      `${theirRate.toFixed(0)}% (${theirs.wins}/${theirs.games})`,
      `**${sign}${delta.toFixed(1)}**`,
    ];
  });
  console.log(
    `\n${table(['герой', `держатель ${label}`, `держатель ${policyB}`, 'разница, п.п.'], rows)}\n` +
      `шум разницы ±${deltaNoise(perHero).toFixed(1)}% (по ~${plural(perHero, [
        'партии',
        'партиям',
        'партиям',
      ])} на героя)`,
  );

  const stuck = main.reports.filter(report => report.status === 'stuck').length;
  const failures = failuresOf(main.reports);
  if (failures.length > 0) {
    console.error(`\nнаходок ${failures.length}, незавершённых ${stuck}:`);
    for (const [reason, found] of groupByReason(failures)) {
      console.error(`\n[${found.length}×] ${reason}`);
      for (const report of found.slice(0, 2)) console.error(showReport(report));
    }
  } else {
    console.log(`\nпадений нет; незавершённых ${stuck}`);
  }

  return { ...main, base, failures, label };
};

const results = [];
for (const depth of depths.length === 0 ? [null] : depths) {
  results.push(await runOne(depth));
}

// сводка «герой × глубина»: по ней видно, где думанье добавляет, а где нет
if (results.length > 1) {
  console.log('\n### Разрез по героям\n');
  console.log(
    table(
      ['герой', ...results.map(result => result.label)],
      heroes.map(heroId => [
        heroName(heroId),
        ...results.map(result => {
          const { mine, delta } = diffOf(result, result.base, heroId);
          const sign = delta >= 0 ? '+' : '';
          return `${percent(mine.wins, mine.games)}% (${sign}${delta.toFixed(1)} п.п.)`;
        }),
      ]),
    ),
  );
}

const broken = results.filter(result => result.failures.length > 0);
if (broken.length > 0) process.exit(1);
