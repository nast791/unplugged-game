import { describe, expect, it } from 'vitest';
import { randomPick, randomValue } from '#shared/helpers/random.js';

const stateWith = seed => ({ settings: { seed } });

describe('случайность партии (helpers/random.js)', () => {
  it('последовательность детерминирована: свой сид — своя, повтор даёт то же', () => {
    const first = randomValue(stateWith(7));
    const second = randomValue(stateWith(7));

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
  });

  it('следующее число отличается от предыдущего и курсор живёт в состоянии', () => {
    const state = stateWith(7);
    const first = randomValue(state);
    const second = randomValue(state);

    expect(second).not.toBe(first);
    expect(state.rng).toBe(second);
  });

  it('разные сиды дают разные последовательности', () => {
    const picks = [1, 2, 3, 4, 5].map(seed => randomPick(stateWith(seed), ['a', 'b', 'c', 'd']));

    expect(new Set(picks).size).toBeGreaterThan(1);
  });

  it('пустой список — null, повторные вызовы двигают последовательность', () => {
    const state = stateWith(3);
    expect(randomPick(state, [])).toBeNull();
    expect(randomPick(state, null)).toBeNull();

    const cards = ['first', 'second', 'third'];
    const picked = [randomPick(state, cards), randomPick(state, cards)];

    for (const card of picked) expect(cards).toContain(card);
    expect(state.rng).toBeGreaterThan(0);
  });
});
