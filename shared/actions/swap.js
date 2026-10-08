import { SET_FIGHTER_CELL } from '#shared/actions/fighter.js';
import { findFighter } from '#shared/helpers/base.js';

/**
 * SWAP_FIGHTERS — обмен местами двух бойцов: оба остаются на поле, меняются клетками.
 * Так работает умение Дороти «Серебряные башмачки»: в конце хода движок подсвечивает Дороти и Тото,
 * а клик по любому из них меняет бойцов местами. Обмена с врагом карты не делают — там нужен был бы
 * выбор цели.
 * params: { a, b } — id бойцов, порядок не важен.
 */
export const SWAP_FIGHTERS = (partyState, action = {}) => {
  const a = action.a == null ? null : String(action.a);
  const b = action.b == null ? null : String(action.b);

  if (!a || !b) throw new Error('SWAP_FIGHTERS: нужны a и b');
  if (a === b) throw new Error('SWAP_FIGHTERS: нужны два разных бойца');

  const left = findFighter(partyState, a).fighter;
  const right = findFighter(partyState, b).fighter;
  if (!left) throw new Error(`SWAP_FIGHTERS: боец "${a}" не найден`);
  if (!right) throw new Error(`SWAP_FIGHTERS: боец "${b}" не найден`);
  if (left.currentPosition == null || right.currentPosition == null) {
    throw new Error('SWAP_FIGHTERS: оба бойца должны стоять на поле');
  }

  const leftCell = left.currentPosition;
  const rightCell = right.currentPosition;
  // обмен — не шаг: телепорт не помечает бойцов «двигавшимися» (правило владельца)
  SET_FIGHTER_CELL(partyState, { fighterId: a, cellId: rightCell, teleport: true });
  SET_FIGHTER_CELL(partyState, { fighterId: b, cellId: leftCell, teleport: true });

  return partyState;
};

export default SWAP_FIGHTERS;
