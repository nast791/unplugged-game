import { describe, expect, it } from 'vitest';
import { rules } from '#shared/constants/rules.js';
import { CHECK_HAND_LIMIT } from '#shared/events/checkHandLimit.js';
import { createState, player, card, PHASES } from '../../fixtures/state.js';

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
    const state = createState();
    const p = player(state);
    while (p.hand.length <= rules.maxHandSize) {
      p.hand.push(card({ id: `extra_${p.hand.length}`, title: 'Extra' }));
    }
    const next = CHECK_HAND_LIMIT(state, {}, {
      enterTurnEnd: s => s,
    });
    expect(next.handDiscard).toMatchObject({
      playerId: '0',
      max: rules.maxHandSize,
      mustDiscard: p.hand.length - rules.maxHandSize,
    });
  });
});
