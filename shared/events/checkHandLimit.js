import { rules } from '#shared/constants/rules.js';
import { zoneCards } from '#shared/helpers.js';

/**
 * CHECK_HAND_LIMIT — перед turnEnd: если hand > max → handDiscard, иначе enterTurnEnd.
 */
export const CHECK_HAND_LIMIT = (state, _payload = {}, { enterTurnEnd } = {}) => {
  if (typeof enterTurnEnd !== 'function') {
    throw new Error('CHECK_HAND_LIMIT: нужен enterTurnEnd');
  }

  const player = (state.players ?? []).find(
    p => String(p.id) === String(state.turn?.playerId),
  );
  if (!player) {
    return enterTurnEnd(state);
  }

  const max = rules.maxHandSize;
  const handLen = zoneCards(player.hand).length;

  if (handLen > max) {
    state.handDiscard = {
      playerId: String(player.id),
      max,
      mustDiscard: handLen - max,
    };
    return state;
  }

  state.handDiscard = null;
  return enterTurnEnd(state);
};

export default CHECK_HAND_LIMIT;
