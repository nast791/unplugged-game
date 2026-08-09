import { describe, expect, it } from 'vitest';
import { playCard } from '#shared/actions/playCard.js';
import { ap, createApi, createState, deck, discard, hand, player } from '../../fixtures/state.js';

describe('PLAY_CARD', () => {
  it('effect: discard → events → −1 AP', () => {
    const state = createState({ actionsLeft: 2 });
    const p = player(state);
    const fx = hand(p).find(c => c.id === 'fx');
    const deckBefore = deck(p).length;
    const api = createApi();

    const next = playCard(
      state,
      { playerId: '0', cardId: fx.instanceId },
      api,
    );

    expect(hand(p).find(c => c.id === 'fx')).toBeUndefined();
    expect(discard(p).some(c => c.id === 'fx')).toBe(true);
    expect(ap(next)).toBe(1);
    expect(deck(p).length).toBe(deckBefore - 1);
  });

  it('attack-карту через PLAY_CARD нельзя', () => {
    const state = createState();
    const atk = hand(player(state)).find(c => c.id === 'atk');
    expect(() =>
      playCard(state, { playerId: '0', cardId: atk.instanceId }, createApi()),
    ).toThrow(/ATTACK/);
  });
});
