import { describe, expect, it } from 'vitest';
import { failuresOf, runSweep, showReport } from '../../bot/tools/sweep.js';

/**
 * Регрессии по конкретным сидам: пары, которые уже один раз вставали намертво.
 *
 * Здесь лежат не «широкие» проверки (они в `duel-fuzz` и `pool-fuzz`), а точные воспроизведения
 * поломок: у каждой — сид, пара и то, что именно ломалось. Такую находку дешевле закрепить одним
 * воспроизводимым прогоном, чем надеяться, что её поймает случайный сид в общем фаззинге.
 */
const cases = [
  {
    heroA: 'ifrit',
    heroB: 'snow-queen',
    seed: 33,
    policy: 'greedy',
    // `deadlock`: обязательное окно «Метели из осколков» открывалось без единой доступной клетки —
    // отказаться от окна нельзя, шагов нет, партия вставала. Правило: пустое перемещение не открывается.
    note: 'Метель из осколков: обязательное окно без доступных клеток',
  },
  {
    heroA: 'anubis',
    heroB: 'ifrit',
    seed: 61,
    policy: 'greedy',
    note: 'запасной сид из той же серии: пара должна доигрываться',
  },
];

describe('регрессии по сидам: партия доигрывается, а не встаёт', () => {
  for (const entry of cases) {
    it(`${entry.heroA} против ${entry.heroB}, сид ${entry.seed}: ${entry.note}`, () => {
      const reports = runSweep([entry.seed], {
        heroA: entry.heroA,
        heroB: entry.heroB,
        policy: entry.policy,
      });

      const [report] = reports;
      expect(failuresOf(reports).map(showReport)).toEqual([]);
      // `stuck` — не падение движка, но для этих сидов партия обязана закрываться
      expect(report.status).toBe('finished');
    }, 120000);
  }
});
