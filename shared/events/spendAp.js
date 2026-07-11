/** SPEND_AP — −1 actionsLeft. Закрытие хода решает caller. */
export const SPEND_AP = state => {
  if (state.actionsLeft <= 0) {
    throw new Error('actionsLeft уже 0');
  }
  state.actionsLeft -= 1;
  return state;
};

export default SPEND_AP;
