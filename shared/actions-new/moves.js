import { SET_ACTIONS, SET_RESIGNED } from '#shared/actions-new/base.js';
import { SET_COMBAT } from '#shared/actions-new/combat.js';
import { SET_MOVEMENT } from '#shared/actions-new/movement.js';
import { SET_TARGETING } from '#shared/actions-new/targeting.js';
import { isCombatParticipant } from '#shared/helpers/combat.js';
import { endGameIfFinished } from '#shared/helpers/turn.js';

export const UI_OK = (partyState, action, phase) => {
  if (!phase?.ok?.onPress) {
    throw new Error('UI_OK: нет активной фазы');
  }
  return phase.ok.onPress(partyState, action);
};

export const UI_BACK = (partyState, action, phase) => {
  if (!phase?.back?.onPress) {
    throw new Error('UI_BACK: нет активной фазы');
  }
  return phase.back.onPress(partyState, action);
};

/**
 * RESIGN доступен в любой фазе любого core-хука: сдаться можно в любой момент.
 * Незакрытые моменты сдавшегося закрываются: бой отменяется (карты в сброс, урона нет),
 * его перемещение и выбор цели снимаются, а если он был активным игроком — ход передаётся дальше.
 */
export const RESIGN = (partyState, action) => {
  const playerId = action.playerId;
  const state = SET_RESIGNED(partyState, { playerId });

  if (isCombatParticipant(state, playerId)) {
    SET_COMBAT(state, { op: 'cancel', playerId });
  }
  if (
    state.movement != null &&
    String(state.movement.playerId) === String(playerId)
  ) {
    SET_MOVEMENT(state, { op: 'close', playerId });
  }
  if (
    state.targeting != null &&
    String(state.targeting.playerId) === String(playerId)
  ) {
    SET_TARGETING(state, { op: 'close', playerId });
  }

  const actionsLeft = Number(state.turn?.actionsLeft) || 0;
  if (String(state.turn?.playerId) === String(playerId) && actionsLeft > 0) {
    SET_ACTIONS(state, { playerId, delta: -actionsLeft });
  }

  return endGameIfFinished(state);
};

/** Общие moves клиента: UI_OK, UI_BACK и RESIGN — делегируют в phase или в экшен. */
export const commonMoves = {
  UI_OK,
  UI_BACK,
  RESIGN,
};

export default commonMoves;
