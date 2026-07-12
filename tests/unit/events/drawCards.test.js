import { describe, expect, it } from 'vitest';
import { DRAW_CARDS } from '#shared/events/drawCards.js';
import { createState, player } from '../../fixtures/state.js';

describe('DRAW_CARDS', () => {
  it('добирает с верха deck в hand', () => {
    const state = createState();
    const p = player(state);
    const beforeHand = p.hand.length;
    const beforeDeck = p.deck.length;
    DRAW_CARDS(state, { count: 1 }, { player: p });
    expect(p.hand.length).toBe(beforeHand + 1);
    expect(p.deck.length).toBe(beforeDeck - 1);
  });

  it('при пустой колоде возвращает discard в deck', () => {
    const state = createState();
    const p = player(state);
    p.deck = [];
    p.discard = [{ id: 'x', instanceId: 'x_0' }];
    DRAW_CARDS(state, { count: 1 }, { player: p });
    expect(p.hand.some(c => c.id === 'x')).toBe(true);
    expect(p.discard).toHaveLength(0);
  });
});
