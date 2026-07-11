/** DRAW_CARDS — добор с верха deck в hand; пустая колода → discard обратно в deck. */
export const DRAW_CARDS = (state, { count = 1 } = {}, { player } = {}) => {
  if (!player || count <= 0) return state;
  if (!Array.isArray(player.deck)) player.deck = [];
  if (!Array.isArray(player.hand)) player.hand = [];
  if (!Array.isArray(player.discard)) player.discard = [];

  for (let i = 0; i < count; i += 1) {
    if (player.deck.length === 0) {
      if (player.discard.length === 0) break;
      // Простой возврат сброса в колоду (без рандома — схематично).
      player.deck = player.discard.splice(0);
    }
    const card = player.deck.pop();
    if (card === undefined) break;
    player.hand.push(card);
  }
  return state;
};

export default DRAW_CARDS;
