import { livingHeroes } from '#shared/lib.js';

/** CHECK_WINNER — игрок жив, пока жив его герой; ≤1 живых → enterGameEnd. */
export const CHECK_WINNER = (state, _payload = {}, { api } = {}) => {
  if (!api?.enterGameEnd) {
    throw new Error('CHECK_WINNER: нужен api.enterGameEnd');
  }
  const alivePlayers = (state.players ?? []).filter(
    p => livingHeroes(p).length > 0,
  );
  if (alivePlayers.length <= 1) {
    const winnerId = alivePlayers[0] ? String(alivePlayers[0].id) : null;
    return api.enterGameEnd(state, winnerId);
  }
  return state;
};

export default CHECK_WINNER;
