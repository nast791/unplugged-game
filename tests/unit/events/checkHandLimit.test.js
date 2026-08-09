import { describe, expect, it } from 'vitest';
import { rules } from '#shared/constants/rules.js';
import { CHECK_HAND_LIMIT } from '#shared/events/checkHandLimit.js';
import { card, createState, hand, player, PHASES } from '../../fixtures/state.js';

describe('CHECK_HAND_LIMIT', () => {
  it('при hand ≤ max вызывает enterTurnEnd', () => {
    const state = createState();
    let ended = false;
    const next = CHECK_HAND_LIMIT(state, {}, {
      enterTurnEnd: s => {
        ended = true;
        return { ...s, hook: PHASES.turnEnd };
      },
    });
    expect(ended).toBe(true);
    expect(next.hook).toBe(PHASES.turnEnd);
  });

  it('при hand > max ставит handDiscard', () => {
    const state = createState();
    const p = player(state);
    const cards = hand(p);
    while (cards.length <= rules.maxHandSize) {
      cards.push(card({ id: `extra_${cards.length}`, title: 'Extra' }));
    }
    const next = CHECK_HAND_LIMIT(state, {}, {
      enterTurnEnd: s => s,
    });
    expect(next.handDiscard).toMatchObject({
      playerId: '0',
      max: rules.maxHandSize,
      mustDiscard: cards.length - rules.maxHandSize,
    });
  });
});
