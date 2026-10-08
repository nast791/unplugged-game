import { actionLine, percent, summarizeMetrics } from '../play/metrics.js';
import {
  deckSize,
  heroIds as poolHeroIds,
  heroName,
  matchups,
  referenceHeroIds,
} from '../play/pool.js';
import { runSweep } from './sweep.js';
/**
 * Матрица матчапов как данные: пары, винрейты и таблицы. Печатает её `bot/tools/matrix.js`
 * (`pnpm test:matrix`), а `docs/hero-balance.md` получает уже готовый markdown.
 *
 * Коридор из `docs/hero-balance.md` §5: герой держит 40–60% против среднего по пулу, отдельный
 * матчап — 30–70%. Выход за коридор помечается `!`: это повод править числа, а не героя.
 */

/** Винрейт героя в серии: считаем только дошедшие до конца партии. */
export const winRateOf = (reports, heroId) => {
  const finished = reports.filter(report => report.status === 'finished');
  const wins = finished.filter(report => String(report.state.winner) === heroId).length;
  return { games: finished.length, wins, rate: percent(wins, finished.length) };
};

/**
 * Прогнать все пары: одна и та же серия сидов на каждую — иначе винрейты пар несравнимы.
 * `policy`/`policyB` — политики сторон (`bot/play/policy.js`): по умолчанию обе случайные, потому что
 * фаззинг ищет баги, а не силу героев. `maxSteps` ограничивает длину партии: с дорогой политикой
 * (например поиском) затянувшаяся партия стоит минуты, а не секунды.
 */
export const runMatrix = ({
  heroes = poolHeroIds,
  seeds,
  mapId = 'generated',
  policy = 'random',
  policyB = null,
  maxSteps = undefined,
  onPair,
} = {}) => {
  const pairResults = matchups(heroes).map(({ heroA, heroB }) => {
    // пара пишется в отчёт: без неё находку не повторить (сид один, а партий много)
    const reports = runSweep(seeds, { heroA, heroB, mapId, policy, policyB, maxSteps }).map(
      report => ({
        ...report,
        matchup: `${heroA} против ${heroB}`,
      }),
    );
    if (onPair) onPair({ heroA, heroB, reports });
    return { heroA, heroB, reports };
  });

  return { pairResults, reports: pairResults.flatMap(pair => pair.reports) };
};

/**
 * Победы политики, назначенной **первому месту**.
 *
 * Важно: политика достаётся месту, а не герою — `playDuel` отдаёт `policy` тому, кто ходит первым, а
 * первым ходит `heroB` на чётных сидах и `heroA` на нечётных. Считать победы героя строки нельзя:
 * он играет то одной политикой, то другой, и разница размывается до ~50% в любом прогоне.
 */
export const firstSeatWins = pairResults => {
  let wins = 0;
  let games = 0;

  for (const pair of pairResults) {
    for (const report of pair.reports) {
      if (report.status !== 'finished') continue;
      const firstHero = Number(report.seed) % 2 === 0 ? pair.heroB : pair.heroA;
      if (String(report.state.winner) === String(firstHero)) wins += 1;
      games += 1;
    }
  }

  return { wins, games };
};

/** «Лестница» в одну сторону: винрейт политики первого места. */
export const ladderLine = (pairResults, policy, policyB) => {
  const { wins, games } = firstSeatWins(pairResults);

  return (
    `лестница: ${policy} (первый игрок) против ${policyB} — ` +
    `${percent(wins, games)}% побед на ${games} партиях`
  );
};

/**
 * «Лестница» в обе стороны: `first` — замер, где политика ходила первой, `mirror` — где второй. Место
 * взаимно сокращается, потому что обе политики получают его поровну.
 *
 * Односторонний замер этого не умеет: первый игрок сам по себе выигрывает 54–61% (`seatLine`), поэтому
 * «жадный взял 63% первым» почти целиком объяснялось бы местом, а не силой политики.
 */
export const ladderAggregateLine = (first, mirror, policy, policyB) => {
  const games = first.games + mirror.games;
  // во встречном замере победы политики — это партии, где победил не первый игрок
  const wins = first.wins + (mirror.games - mirror.wins);
  const losses = games - wins;

  return (
    `лестница в обе стороны (место убрано): ${policy} против ${policyB} — ` +
    `${percent(wins, games)}% против ${percent(losses, games)}% ` +
    `(${wins} против ${losses} на ${games} партиях)`
  );
};

/** Пометка выхода за коридор: матчап 30–70%, средний винрейт героя 40–60%. */
export const corridorMark = (rate, low, high) => (rate < low || rate > high ? ' !' : '');

/** Строка «Герой (эталон)»: наши герои равняются на Медузу и Теслу. */
export const displayName = heroId =>
  referenceHeroIds.includes(heroId) ? `${heroName(heroId)} (эталон)` : heroName(heroId);

/** Поправка на шум: доля измерена по `games` партиям, поэтому у края коридора нужен запас. */
export const noiseMargin = games => 1.96 * Math.sqrt(0.25 / Math.max(1, games)) * 100;

const table = (header, rows) =>
  [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map(cells => `| ${cells.join(' | ')} |`),
  ].join('\n');

/** Таблица «кто кого»: в клетке — винрейт героя строки против героя столбца. */
export const matrixTable = (pairResults, heroes) => {
  const rates = new Map(
    pairResults.map(pair => [
      `${pair.heroA}:${pair.heroB}`,
      winRateOf(pair.reports, pair.heroA).rate,
    ]),
  );

  return table(
    ['герой \\ против', ...heroes.map(heroId => heroName(heroId))],
    heroes.map(rowHero => [
      displayName(rowHero),
      ...heroes.map(colHero => {
        if (rowHero === colHero) return '—';
        const rate = rates.get(`${rowHero}:${colHero}`) ?? 0;
        return `${rate}%${corridorMark(rate, 30, 70)}`;
      }),
    ]),
  );
};

/** Таблица героев: метрики, свёрнутые по всем парам героя. */
export const heroesTable = (reports, heroes) => {
  const metrics = summarizeMetrics(reports);

  return table(
    [
      'герой',
      'колода',
      'партий',
      'побед',
      'средняя длина',
      'атак за партию',
      'урон за партию',
      'покрытие',
      'действия',
    ],
    heroes
      .filter(heroId => metrics.heroes[heroId])
      .map(heroId => {
        const row = metrics.heroes[heroId];
        const rate = percent(row.wins, row.games);
        return [
          displayName(heroId),
          `${deckSize(heroId)} / ${row.deck.length}`,
          row.games,
          `${rate}%${corridorMark(rate, 40, 60)}`,
          Math.round(row.steps / row.games),
          ((row.actions.attack ?? 0) / row.games).toFixed(1),
          `${(row.dealt / row.games).toFixed(1)} / ${(row.taken / row.games).toFixed(1)}`,
          `${row.played.size}/${row.deck.length} (${percent(row.played.size, row.deck.length)}%)`,
          actionLine(row.actions),
        ];
      }),
  );
};

/** Итог по серии: сколько партий и как часто исход решало первое убийство. */
export const totalsLine = reports => {
  const { totals } = summarizeMetrics(reports);
  return (
    `всего партий до конца: ${totals.games}; исход решило первое убийство: ` +
    `${totals.decidedByFirstBlood} из ${totals.deaths} партий с убийствами ` +
    `(${percent(totals.decidedByFirstBlood, totals.deaths)}%)`
  );
};

/**
 * Доля ходов, в которых потрачено **два и более действий**: «стратегия на ход» вместо одного действия.
 * Метрику считает `bot/play/metrics.js` по остатку действий движка; у случайного бота доля низкая, у
 * планировщика (`--policy=chain`) должна быть выше.
 */
export const turnsLine = reports => {
  const { totals } = summarizeMetrics(reports);
  return (
    `ходов с 2+ действиями: ${totals.fullTurns} из ${totals.turns} ` +
    `(${percent(totals.fullTurns, totals.turns)}%)`
  );
};

/**
 * Перевес места: доля партий, где победил игрок, ходивший первым. Сиды раздают первое место обеим
 * сторонам поровну, поэтому заметный перекос — сигнал баланса, а не силы героя, и ловить его стоит до
 * правки чисел. Зеркал в игре нет (`player.id` — id героя), так что это единственная проверка места.
 */
export const seatLine = reports => {
  const finished = reports.filter(report => report.status === 'finished');
  let first = 0;

  for (const report of finished) {
    const heroes = (report.state.settings?.heroes ?? [])
      .slice()
      .sort((left, right) => Number(left.order) - Number(right.order));
    if (String(heroes[0]?.heroId) === String(report.state.winner)) first += 1;
  }

  return `первый игрок победил ${first} из ${finished.length} партий (${percent(first, finished.length)}%)`;
};
