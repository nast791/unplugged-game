import { rules } from '#shared/constants/rules.js';

/**
 * CHECK_HAND_LIMIT — перед turnEnd: если hand > max → handDiscard, иначе enterTurnEnd.
 * Вызывается как beforeEnterTurnEnd (не публичный sendAction).
 */
export const CHECK_HAND_LIMIT = (state, _payload = {}, { enterTurnEnd } = {}) => {
  if (typeof enterTurnEnd !== 'function') {
    throw new Error('CHECK_HAND_LIMIT: нужен enterTurnEnd');
  }

  const player = (state.players ?? []).find(
    p => String(p.id) === String(state.currentPlayer),
  );
  if (!player) {
    return enterTurnEnd(state);
  }

  const max = rules.maxHandSize;
  const handLen = Array.isArray(player.hand) ? player.hand.length : 0;

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
