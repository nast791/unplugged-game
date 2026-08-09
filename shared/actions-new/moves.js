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

/** Общие moves клиента (UI_OK, UI_BACK) — делегируют в phase.ok / phase.back. */
export const commonMoves = {
  UI_OK,
  UI_BACK,
};

export default commonMoves;
