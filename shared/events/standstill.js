import { zoneCards } from '#shared/helpers.js';
import { DRAW_CARDS } from './drawCards.js';
import { EXHAUSTION } from './exhaustion.js';
import { SPEND_AP } from './spendAp.js';

/** STANDSTILL — мув на месте: добор 1 или EXHAUSTION, затем −1 AP. */
export const STANDSTILL = (state, _payload = {}, { player, api } = {}) => {
  if (!player) {
    throw new Error('STANDSTILL: нужен player');
  }

  state.movement = null;

  if (zoneCards(player.deck).length === 0) {
    const next = EXHAUSTION(state, { damage: 2 }, { player, api });
    if (next.hook === 'gameEnd') return next;
  } else {
    DRAW_CARDS(state, { count: 1 }, { player });
  }

  if ((Number(state.turn?.actionsLeft) || 0) <= 0) {
    throw new Error('STANDSTILL: actionsLeft уже 0');
  }
  SPEND_AP(state);

  if ((Number(state.turn?.actionsLeft) || 0) <= 0) {
    return api.enterTurnEnd(state);
  }
  return state;
};

export default STANDSTILL;
