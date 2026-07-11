import { PHASES } from '@nast791/engine/constants';
import { DRAW_CARDS } from './drawCards.js';
import { EXHAUSTION } from './exhaustion.js';
import { SPEND_AP } from './spendAp.js';

/**
 * STANDSTILL — мув на месте: добор 1 или EXHAUSTION при пустой колоде, затем −1 AP.
 * ctx.player обязателен.
 */
export const STANDSTILL = (state, _payload = {}, { player, api } = {}) => {
  if (!player) {
    throw new Error('STANDSTILL: нужен player');
  }

  state.movement = null;

  const deckEmpty = !Array.isArray(player.deck) || player.deck.length === 0;
  if (deckEmpty) {
    const next = EXHAUSTION(state, { damage: 2 }, { player, api });
    if (next.phase === PHASES.gameEnd) return next;
  } else {
    DRAW_CARDS(state, { count: 1 }, { player });
  }

  if ((Number(state.actionsLeft) || 0) <= 0) {
    throw new Error('STANDSTILL: actionsLeft уже 0');
  }
  SPEND_AP(state);

  if ((Number(state.actionsLeft) || 0) <= 0) {
    return api.enterTurnEnd(state);
  }
  return state;
};

export default STANDSTILL;
