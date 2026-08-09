import { describe, expect, it } from 'vitest';
import { DISCARD_CARDS } from '#shared/events/discardCards.js';
import { createApi, createState, hand, player, PHASES } from '../../fixtures/state.js';

describe('DISCARD_CARDS', () => {
  it('сбрасывает до лимита и enterTurnEnd', () => {
    const state = createState({
      handDiscard: { playerId: '0', max: 2, mustDiscard: 1 },
    });
    const p = player(state);
    const cards = hand(p);
    while (cards.length > 3) cards.pop();
    state.handDiscard.mustDiscard = cards.length - 2;
    const api = createApi();
    const cardId = cards[0].instanceId;
    const next = DISCARD_CARDS(
      state,
      { playerId: '0', cardId },
      { api },
    );
    expect(next.handDiscard).toBeNull();
    expect(next.hook).toBe(PHASES.turnEnd);
  });
});
