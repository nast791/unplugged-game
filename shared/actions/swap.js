import { SET_FIGHTER_CELL } from '#shared/actions/fighter.js';
import { findFighter } from '#shared/helpers/base.js';

/**
 * SWAP_FIGHTERS — обмен местами двух бойцов: оба остаются на поле, меняются клетками.
 * Так работает умение Дороти «Серебряные башмачки» (в конце хода движок подсвечивает Дороти и Тото,
 * клик по любому из них меняет бойцов местами) и её карта «Тото отвлекает»: боец противника
 * из битвы меняется местами с Тото.
 * params: { a, b } — id бойцов, порядок не важен. Значение приходит из факта, поэтому принимается
 * и список (`COMBAT { select: 'opponent' }` → `['beta']`), и объект факта `{ fighterId }`: у списка
 * берётся первый — в битве у стороны ровно один боец.
 */
const idOf = value => {
  const first = Array.isArray(value) ? value[0] : value;
  if (first == null) return null;
  if (typeof first === 'object') return String(first.fighterId ?? first.id ?? '') || null;
  return String(first);
};

export const SWAP_FIGHTERS = (partyState, action = {}) => {
  const a = idOf(action.a);
  const b = idOf(action.b);

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
