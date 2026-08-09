import { describe, expect, it } from 'vitest';
import { DRAW_CARDS } from '#shared/events/drawCards.js';
import { createState, deck, discard, hand, player } from '../../fixtures/state.js';

describe('DRAW_CARDS', () => {
  it('добирает с верха deck в hand', () => {
    const state = createState();
    const p = player(state);
    const beforeHand = hand(p).length;
    const beforeDeck = deck(p).length;
    DRAW_CARDS(state, { count: 1 }, { player: p });
    expect(hand(p).length).toBe(beforeHand + 1);
    expect(deck(p).length).toBe(beforeDeck - 1);
  });

  it('при пустой колоде возвращает discard в deck', () => {
    const state = createState();
    const p = player(state);
    p.deck = { visibility: [], cards: [] };
    p.discard = { visibility: [], cards: [{ id: 'x', instanceId: 'x_0' }] };
    DRAW_CARDS(state, { count: 1 }, { player: p });
    expect(hand(p).some(c => c.id === 'x')).toBe(true);
    expect(discard(p)).toHaveLength(0);
  });
});
