import { describe, expect, it } from 'vitest';
import { describeSweep, failuresOf, runSweep, showReport } from '../support/duel-sweep.js';

/**
 * Фаззинг дуэли Медуза против Теслы: бот играет партии сам и ищет баги.
 * Прогон воспроизводим: у каждого сида своя партия, лог действий есть в отчёте.
 *
 * Когда бот находит баг, здесь печатается сид, шаг, действие и сообщение движка — по этому
 * набору партия повторяется один в один. Разбор находок — в конце файла.
 *
 * Тот же прогон руками (быстрее и с флагами): `pnpm test:bot -- --seeds=2000`, разбор одного
 * сида — `pnpm test:bot -- --seed=50`.
 */
/** Сколько партий гонять: по умолчанию 60, длинные серии — через FUZZ_SEEDS или флаг `--seeds`. */
const SEED_COUNT = Number(process.env.FUZZ_SEEDS) || 60;
const SEEDS = Array.from({ length: SEED_COUNT }, (_, index) => index + 1);

describe('фаззинг: бот играет дуэль Медуза против Теслы', () => {
  // серия длинная (по умолчанию 60 партий, через FUZZ_SEEDS — тысячи), поэтому лимит поднят
  it('ни одна партия не падает и не встаёт без действий', () => {
    const reports = runSweep(SEEDS);
    const { lines } = describeSweep(reports);

    for (const line of lines) console.log(line);
    expect(failuresOf(reports).map(showReport)).toEqual([]);
  }, 180000);
});
