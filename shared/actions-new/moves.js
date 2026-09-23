import { SET_RESIGNED } from '#shared/actions-new/base.js';
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

/** RESIGN доступен в любой фазе любого core-хука: сдаться можно в любой момент. */
export const RESIGN = (partyState, action) =>
  endGameIfFinished(SET_RESIGNED(partyState, { playerId: action.playerId }));

/** Общие moves клиента: UI_OK, UI_BACK и RESIGN — делегируют в phase или в экшен. */
export const commonMoves = {
  UI_OK,
  UI_BACK,
  RESIGN,
};

export default commonMoves;
