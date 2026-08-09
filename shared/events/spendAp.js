/** SPEND_AP — −1 turn.actionsLeft. */
export const SPEND_AP = state => {
  if ((state.turn?.actionsLeft ?? 0) <= 0) {
    throw new Error('actionsLeft уже 0');
  }
  state.turn.actionsLeft -= 1;
  return state;
};

export default SPEND_AP;
