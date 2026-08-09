/** Сдаться — победа второго игрока (1v1). */
export const resign = (state, action, { enterGameEnd }) => {
  const others = state.players.filter(
    p => String(p.id) !== String(action.playerId),
  );
  if (state.players.length !== 2 || others.length !== 1) {
    throw new Error('RESIGN только для партии на двоих');
  }
  return enterGameEnd(state, String(others[0].id));
};

export default resign;
