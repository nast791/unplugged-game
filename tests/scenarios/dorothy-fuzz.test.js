import { describe, expect, it } from 'vitest';
import { createDuel } from '../../bot/play/duel.js';
import { failuresOf, plural, runSweep, showReport } from '../../bot/tools/sweep.js';

/**
 * Фаззинг дуэлей с Дороти: бот играет партии сам и ищет поломки в её колоде и умении
 * (обмен в конце хода, «Наотмашь», «Залп», «Подмога», возврат Тото). Прогон воспроизводим:
 * у каждого сида своя партия, а находка печатается с логом последних действий.
 *
 * Отчёт про победы здесь — не баланс: бот играет почти случайно и не умеет играть парой
 * Дороти + Тото. Он нужен, чтобы победа была достижима за обе стороны и партия не вставала.
 */
const SEED_COUNT = Number(process.env.FUZZ_SEEDS) || 40;
const SEEDS = Array.from({ length: SEED_COUNT }, (_, index) => index + 1);
const MATCHUPS = [
  { heroA: 'dorothy', heroB: 'medusa' },
  { heroA: 'dorothy', heroB: 'tesla' },
];

describe('фаззинг: дуэли с Дороти', () => {
  it('колода собирается в 30 карт и 13 уникальных', () => {
    const state = createDuel(1, 'dorothy_deck_check', { heroA: 'dorothy', heroB: 'medusa' });
    const dorothy = (state.players ?? []).find(player => String(player.id) === 'dorothy');
    const cards = [...(dorothy?.deck?.cards ?? []), ...(dorothy?.hand?.cards ?? [])];

    expect(cards).toHaveLength(30);
    expect(new Set(cards.map(card => card.id)).size).toBe(13);
    // привязки: карты Тото гаснут вместе с ним, поэтому их ровно пять копий
    expect(cards.filter(card => card.fighter === 'toto')).toHaveLength(5);
  });

  it('ни одна партия не падает и не встаёт без действий', () => {
    for (const matchup of MATCHUPS) {
      const reports = runSweep(SEEDS, matchup);
      const summary = reports.reduce((acc, report) => {
        acc[report.status] = (acc[report.status] ?? 0) + 1;
        return acc;
      }, {});
      const wins = reports
        .filter(report => report.status === 'finished')
        .reduce((acc, report) => {
          const winner = String(report.state.winner);
          acc[winner] = (acc[winner] ?? 0) + 1;
          return acc;
        }, {});

      console.log(
        `${matchup.heroA} против ${matchup.heroB}: ` +
          plural(reports.length, ['партия', 'партии', 'партий']) +
          `, до конца ${summary.finished ?? 0}, падений ${summary.crash ?? 0}, ` +
          `тупиков ${summary.deadlock ?? 0}, пустых действий ${summary.noop ?? 0}, ` +
          `не завершились ${summary.stuck ?? 0}; победы: ` +
          Object.entries(wins)
            .map(([id, count]) => `${id} ${count}`)
            .join(', '),
      );
      for (const report of failuresOf(reports)) console.log(showReport(report));
      // noop и stuck прогон не роняют, но это тоже сигнал: пустое действие = кнопка «ничего не делает»
      const quiet = reports.filter(report => report.status === 'noop' || report.status === 'stuck');
      for (const report of quiet.slice(0, 2)) console.log(showReport(report));

      expect(failuresOf(reports).map(showReport)).toEqual([]);
    }
  }, 180000);
});
