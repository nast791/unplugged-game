import { describe, expect, it } from 'vitest';
import { playCard } from '#shared/actions/playCard.js';
import { createApi, createState, player } from '../../fixtures/state.js';

describe('PLAY_CARD', () => {
  it('effect: discard → events → −1 AP', () => {
    const state = createState({ actionsLeft: 2 });
    const p = player(state);
    const fx = p.hand.find(c => c.id === 'fx');
    const deckBefore = p.deck.length;
    const api = createApi();

    // playCard uses getCardEngine from @nast791/cards/server — needs #tabletop-card-effects
    // May fail without Nuxt alias. If so, we'll mock or use nuxt env.
    const next = playCard(
      state,
      { playerId: '0', cardId: fx.instanceId },
      api,
    );

    expect(p.hand.find(c => c.id === 'fx')).toBeUndefined();
    expect(p.discard.some(c => c.id === 'fx')).toBe(true);
    expect(next.actionsLeft).toBe(1);
    // DRAW_CARDS from card events
    expect(p.deck.length).toBe(deckBefore - 1);
  });

  it('attack-карту через PLAY_CARD нельзя', () => {
    const state = createState();
    const atk = player(state).hand.find(c => c.id === 'atk');
    expect(() =>
      playCard(state, { playerId: '0', cardId: atk.instanceId }, createApi()),
    ).toThrow(/ATTACK/);
  });
});
