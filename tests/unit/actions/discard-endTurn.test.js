import { describe, expect, it } from 'vitest';
import {
  DISCARD_CARDS,
  END_TURN,
  beforeEnterTurnEnd,
} from '#shared/actions/index.js';
import { createApi, createState, player, PHASES } from '../../fixtures/state.js';

describe('DISCARD_CARDS (action = event)', () => {
  it('sendAction-сигнатура: (state, action, api)', () => {
    const state = createState({
      handDiscard: { playerId: '0', max: 2, mustDiscard: 1 },
    });
    const p = player(state);
    while (p.hand.length > 3) p.hand.pop();
    state.handDiscard.mustDiscard = p.hand.length - 2;
    const next = DISCARD_CARDS(
      state,
      { playerId: '0', cardId: p.hand[0].instanceId },
      createApi(),
    );
    expect(next.phase).toBe(PHASES.turnEnd);
  });
});

describe('END_TURN (action = event)', () => {
  it('sendAction-сигнатура: (state, action, api)', () => {
    const state = createState({ actionsLeft: 0 });
    const next = END_TURN(state, { playerId: '0' }, createApi());
    expect(next.phase).toBe(PHASES.turnEnd);
  });
});

describe('beforeEnterTurnEnd', () => {
  it('при нормальной руке → enterTurnEnd', () => {
    const state = createState();
    const next = beforeEnterTurnEnd(state, {
      enterTurnEnd: s => ({ ...s, phase: PHASES.turnEnd }),
    });
    expect(next.phase).toBe(PHASES.turnEnd);
  });
});
