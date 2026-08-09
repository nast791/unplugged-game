import { zoneCards } from '#shared/helpers.js';

const ensureZone = zone => {
  if (zone?.cards) return zone;
  return { visibility: zone?.visibility ?? [], cards: Array.isArray(zone) ? [...zone] : [] };
};

/** DRAW_CARDS — добор с верха deck в hand. */
export const DRAW_CARDS = (state, { count = 1 } = {}, { player } = {}) => {
  if (!player || count <= 0) return state;

  player.hand = ensureZone(player.hand);
  player.deck = ensureZone(player.deck);
  player.discard = ensureZone(player.discard);

  const hand = player.hand.cards;
  const deck = player.deck.cards;
  const discard = player.discard.cards;

  for (let i = 0; i < count; i += 1) {
    if (deck.length === 0) {
      if (discard.length === 0) break;
      player.deck.cards = discard.splice(0);
    }
    const card = player.deck.cards.pop();
    if (card === undefined) break;
    hand.push(card);
  }
  return state;
};

export default DRAW_CARDS;
