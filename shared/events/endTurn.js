import {
  assertNoPendingCombat,
  assertNoPendingMovement,
} from '#shared/helpers.js';
import { STANDSTILL } from './standstill.js';

const asApi = x =>
  x && typeof x.enterTurnEnd === 'function' ? x : x?.api;

/** END_TURN — AP > 0 → STANDSTILL; AP = 0 → enterTurnEnd. */
export const END_TURN = (state, { playerId } = {}, ctxOrApi = {}) => {
  const api = asApi(ctxOrApi);
  if (state.hook !== 'turn') {
    throw new Error(`END_TURN только в hook=turn, сейчас "${state.hook}"`);
  }
  if (state.handDiscard) {
    throw new Error('END_TURN: сначала сбросьте лишние карты (DISCARD_CARDS)');
  }
  assertNoPendingCombat(state, 'END_TURN');
  assertNoPendingMovement(state, 'END_TURN');

  if ((Number(state.turn?.actionsLeft) || 0) > 0) {
    const player = state.players.find(p => String(p.id) === String(playerId));
    if (!player) {
      throw new Error(`END_TURN: игрок ${playerId} не найден`);
    }
    return STANDSTILL(state, {}, { player, api });
  }

  return api.enterTurnEnd(state);
};

export default END_TURN;
