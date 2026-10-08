import { describe, expect, it } from 'vitest';
import { heroesTable, matrixTable, runMatrix, totalsLine } from '../../bot/tools/matchup.js';
import { heroIds, matchups } from '../../bot/play/pool.js';
import { failuresOf, runSweep, showReport } from '../../bot/tools/sweep.js';

/**
 * Фаззинг всего пула: каждая упорядоченная пара героев играет одну и ту же серию сидов, поэтому
 * находку видно сразу на всех героях, а не только на эталонной паре. Здесь же печатается матрица
 * матчапов и сводка по героям — те же таблицы, что даёт `pnpm test:matrix`, только на короткой серии.
 *
 * Победы на трёх партиях — не баланс: бот играет почти случайно, и это проверка того, что победа
 * достижима за каждого героя и партия не встаёт. Настоящие метрики — на длинной серии.
 */
const GAMES = Number(process.env.FUZZ_SEEDS) || 3;
const SEEDS = Array.from({ length: GAMES }, (_, index) => index + 1);

/**
 * Известных находок контента сейчас нет — все три разобраны: `SET_CARDS` принимает объекты факта
 * (`snow-queen_12`), `anubis_08` снимает раскрытие один раз, а бот видит обязательную защиту картой.
 * Поэтому любая находка — новая и роняет набор. Повторы для разбора: `node bot/tools/run.js --seeds=2
 * --heroes=snow-queen,tesla`, `--seeds=1 --heroes=anubis,ifrit`, `--seeds=5 --heroes=anubis,ifrit`.
 */
const expectNoNewFindings = reports => {
  expect(failuresOf(reports).map(showReport)).toEqual([]);
};

describe('фаззинг: пул героев против пула', () => {
  it('каждая пара доходит до конца; матрица и метрики печатаются', () => {
    const { pairResults, reports } = runMatrix({ heroes: heroIds, seeds: SEEDS });

    console.log(
      `матрица: героев ${heroIds.length}, пар ${pairResults.length}, ` +
        `по ${GAMES} партии на пару (сиды ${SEEDS[0]}…${SEEDS[SEEDS.length - 1]})`,
    );
    console.log(matrixTable(pairResults, heroIds));
    console.log(heroesTable(reports, heroIds));
    console.log(totalsLine(reports));

    // в матрице должны побывать все герои пула: иначе пара просто не собралась
    const played = new Set(
      reports.flatMap(report => (report.state?.players ?? []).map(player => String(player.id))),
    );
    expect([...played].sort()).toEqual([...heroIds].sort());
    expect(pairResults).toHaveLength(matchups(heroIds).length);
    expectNoNewFindings(reports);
  }, 300000);

  it('пара из контента выбирается флагами: любой герой против любого', () => {
    // жадной политикой: у неё своя раздача действий (шаги, защита картой), и она тоже должна быть чистой
    const reports = runSweep(SEEDS, {
      heroA: 'anubis',
      heroB: 'tesla',
      mapId: 'generated',
      policy: 'greedy',
    });

    for (const report of reports.filter(entry => entry.status === 'finished')) {
      expect(['anubis', 'tesla']).toContain(String(report.state.winner));
    }
    expectNoNewFindings(reports);
  }, 120000);
});
