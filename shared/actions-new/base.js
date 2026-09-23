import { findPlayer } from '#shared/helpers/base.js';

/**
 * Базовые манипуляторы состояния партии и хода.
 */

/**
 * SET_ACTIONS — изменить остаток действий хода.
 * params: { playerId, delta } — объявление действия: −1; карта или способность «+1 действие»: +1.
 * Объявление действия (−1) заодно снимает итоги прошлого действия (lastCombat / lastBonus).
 */
export const SET_ACTIONS = (partyState, action = {}) => {
  const playerId = action.playerId ?? partyState.turn?.playerId;
  if (playerId == null) throw new Error('SET_ACTIONS: нужен playerId');
  if (!findPlayer(partyState, playerId)) {
    throw new Error(`SET_ACTIONS: игрок ${playerId} не найден`);
  }

  const delta = Number(action.delta);
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error('SET_ACTIONS: нужен целый ненулевой delta');
  }

  const left = Number(partyState.turn?.actionsLeft) || 0;
  if (left + delta < 0) {
    throw new Error(
      `SET_ACTIONS: у игрока ${playerId} нет действий (осталось ${left})`,
    );
  }

  if (delta < 0) {
    partyState.lastCombat = null;
    partyState.lastBonus = null;
  }

  partyState.turn = { ...partyState.turn, actionsLeft: left + delta };
  return partyState;
};

export default SET_ACTIONS;

/**
 * SET_RESIGNED — игрок сдался: выходит из партии, его бойцы уходят с поля.
 * params: { playerId }
 */
export const SET_RESIGNED = (partyState, action = {}) => {
  const playerId = action.playerId ?? partyState.turn?.playerId;
  const player = findPlayer(partyState, playerId);
  if (!player) throw new Error(`SET_RESIGNED: игрок ${playerId} не найден`);
  if (player.resigned) throw new Error('SET_RESIGNED: игрок уже сдался');

  player.resigned = true;
  player.fighters = [];
  return partyState;
};
