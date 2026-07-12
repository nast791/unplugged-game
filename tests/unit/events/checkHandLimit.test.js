import { describe, expect, it } from 'vitest';
import { CHECK_HAND_LIMIT } from '#shared/events/checkHandLimit.js';
import { createState, player, PHASES } from '../../fixtures/state.js';

describe('CHECK_HAND_LIMIT', () => {
  it('при hand ≤ max вызывает enterTurnEnd', () => {
    const state = createState();
    let ended = false;
    const next = CHECK_HAND_LIMIT(state, {}, {
      enterTurnEnd: s => {
        ended = true;
        return { ...s, phase: PHASES.turnEnd };
      },
    });
    expect(ended).toBe(true);
    expect(next.phase).toBe(PHASES.turnEnd);
  });

  it('при hand > max ставит handDiscard', () => {
    const state = createState({ rules: { maxHandSize: 2 } });
    const p = player(state);
    expect(p.hand.length).toBeGreaterThan(2);
    const next = CHECK_HAND_LIMIT(state, {}, {
      enterTurnEnd: s => s,
    });
    expect(next.handDiscard).toMatchObject({
      playerId: '0',
      max: 2,
      mustDiscard: p.hand.length - 2,
    });
  });
});
