import { PHASES } from '@nast791/engine/constants';
import {
  assertNoPendingCombat,
  assertNoPendingMovement,
} from '#shared/lib.js';
import { STANDSTILL } from './standstill.js';

/**
 * END_TURN — не игровой «ход-карта», а закрытие/пас действия.
 * AP > 0 → STANDSTILL; AP = 0 → enterTurnEnd (далее CHECK_HAND_LIMIT).
 */
export const END_TURN = (state, { playerId } = {}, { api } = {}) => {
  if (state.phase !== PHASES.turn) {
    throw new Error(`END_TURN только в phase=turn, сейчас "${state.phase}"`);
  }
  if (state.handDiscard) {
    throw new Error('END_TURN: сначала сбросьте лишние карты (DISCARD)');
  }
  assertNoPendingCombat(state, 'END_TURN');
  assertNoPendingMovement(state, 'END_TURN');

  if ((Number(state.actionsLeft) || 0) > 0) {
    const player = state.players.find(p => String(p.id) === String(playerId));
    if (!player) {
      throw new Error(`END_TURN: игрок ${playerId} не найден`);
    }
    return STANDSTILL(state, {}, { player, api });
  }

  return api.enterTurnEnd(state);
};

export default END_TURN;
