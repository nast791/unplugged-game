import { describe, expect, it } from 'vitest';
import { heroes } from '../../../server/content/index.js';

/**
 * Правило колоды (`docs/hero-algorithm.md` §6):
 * - хотя бы одна карта с усилением 3 или 4 — иначе колоде нечем разгонять манёвр и атаку;
 * - карт с усилением 4 не больше одной **уникальной** — это редкость, и она не обязательна;
 *   копий у неё может быть сколько угодно (`quantity` правилом не ограничено);
 * - усиление есть и у эффектов: поле `bonus` не только у атак, защит и гибридов.
 */
const decks = Object.values(heroes).map(hero => ({
  id: hero.id,
  name: hero.name ?? hero.id,
  cards: hero.cards ?? [],
}));

describe('усиление (бонус) в колодах героев', () => {
  it('в каждой колоде есть хотя бы одна карта с бонусом 3 или 4', () => {
    const withoutBig = decks
      .filter(deck => !deck.cards.some(card => Number(card.bonus) >= 3))
      .map(deck => deck.id);

    expect(withoutBig).toEqual([]);
  });

  it('карт с бонусом 4 — не больше одной уникальной на колоду', () => {
    for (const deck of decks) {
      const fours = deck.cards.filter(card => Number(card.bonus) === 4);
      expect(fours.length, `колода ${deck.id}`).toBeLessThanOrEqual(1);
    }
  });

  it('бонус каждой карты — целое от 1 до 4, включая эффекты', () => {
    for (const deck of decks) {
      for (const card of deck.cards) {
        expect(Number.isInteger(card.bonus), `${deck.id}/${card.id}`).toBe(true);
        expect(card.bonus, `${deck.id}/${card.id}`).toBeGreaterThanOrEqual(1);
        expect(card.bonus, `${deck.id}/${card.id}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('у эффектов бонус задан так же, как у боевых карт', () => {
    const effects = decks.flatMap(deck =>
      deck.cards.filter(card => card.type === 'effect').map(card => ({ deck: deck.id, card })),
    );

    expect(effects.length).toBeGreaterThan(0);
    for (const { deck, card } of effects) {
      expect(card.bonus, `${deck}/${card.id}`).toBeGreaterThanOrEqual(1);
      expect(card.quantity, `${deck}/${card.id}`).toBeGreaterThanOrEqual(1);
    }
  });
});
