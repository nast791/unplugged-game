import { describe, expect, it } from 'vitest';
import { DISCARD_CARDS } from '#shared/events/discardCards.js';
import { createApi, createState, player, PHASES } from '../../fixtures/state.js';

describe('DISCARD_CARDS', () => {
  it('сбрасывает до лимита и enterTurnEnd', () => {
    const state = createState({
      handDiscard: { playerId: '0', max: 2, mustDiscard: 1 },
    });
    const p = player(state);
    // оставить 2 карты: сбросить лишние
    while (p.hand.length > 3) p.hand.pop();
    state.handDiscard.mustDiscard = p.hand.length - 2;
    const api = createApi();
    const cardId = p.hand[0].instanceId;
    const next = DISCARD_CARDS(
      state,
      { playerId: '0', cardId },
      { api },
    );
    expect(next.handDiscard).toBeNull();
    expect(next.phase).toBe(PHASES.turnEnd);
  });
});
