import { describe, expect, it } from 'vitest';
import {
  DISCARD_CARDS,
  END_TURN,
  beforeEnterTurnEnd,
} from '#shared/actions/index.js';
import { createApi, createState, hand, player, PHASES } from '../../fixtures/state.js';

describe('DISCARD_CARDS (action = event)', () => {
  it('sendAction-сигнатура: (state, action, api)', () => {
    const state = createState({
      handDiscard: { playerId: '0', max: 2, mustDiscard: 1 },
    });
    const p = player(state);
    const cards = hand(p);
    while (cards.length > 3) cards.pop();
    state.handDiscard.mustDiscard = cards.length - 2;
    const next = DISCARD_CARDS(
      state,
      { playerId: '0', cardId: cards[0].instanceId },
      createApi(),
    );
    expect(next.hook).toBe(PHASES.turnEnd);
  });
});

describe('END_TURN (action = event)', () => {
  it('sendAction-сигнатура: (state, action, api)', () => {
    const state = createState({ actionsLeft: 0 });
    const next = END_TURN(state, { playerId: '0' }, createApi());
    expect(next.hook).toBe(PHASES.turnEnd);
  });
});

describe('beforeEnterTurnEnd', () => {
  it('при нормальной руке → enterTurnEnd', () => {
    const state = createState();
    const next = beforeEnterTurnEnd(state, {
      enterTurnEnd: s => ({ ...s, hook: PHASES.turnEnd }),
    });
    expect(next.hook).toBe(PHASES.turnEnd);
  });
});
