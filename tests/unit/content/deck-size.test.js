import { describe, expect, it } from 'vitest';
import { heroes } from '../../../server/content/index.js';

/**
 * Правило колоды (`docs/hero-algorithm.md` §6, §9): у героя ровно **30 копий** карт — сумма `quantity`
 * по всем картам колоды. Число копий не «примерно тридцать»: недобранная колода ломает баланс добора,
 * истощение и лимит руки, поэтому проверяется тестом, а не глазомером.
 */
const DECK_SIZE = 30;

const decks = Object.values(heroes).map(hero => ({
  id: hero.id,
  name: hero.name ?? hero.id,
  cards: hero.cards ?? [],
}));

const copiesOf = deck => deck.cards.reduce((sum, card) => sum + (Number(card.quantity) || 0), 0);

describe('размер колоды героя', () => {
  it('в колоде ровно 30 копий', () => {
    const wrong = decks
      .map(deck => ({ id: deck.id, copies: copiesOf(deck) }))
      .filter(deck => deck.copies !== DECK_SIZE);

    expect(wrong).toEqual([]);
  });

  it('копий у карты — целое число не меньше одной', () => {
    for (const deck of decks) {
      for (const card of deck.cards) {
        expect(Number.isInteger(card.quantity), `${deck.id}/${card.id}`).toBe(true);
        expect(card.quantity, `${deck.id}/${card.id}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('id карт внутри колоды не повторяются', () => {
    for (const deck of decks) {
      const ids = deck.cards.map(card => card.id);
      expect(new Set(ids).size, `колода ${deck.id}`).toBe(ids.length);
    }
  });
});
