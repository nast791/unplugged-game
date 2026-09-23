import { findFighter } from '#shared/helpers/base.js';
import { findNode } from '#shared/helpers/placement.js';

/**
 * SET_FIGHTER_CELL — позиция бойца: поставить на клетку или снять с поля (cellId = null).
 * Один кирпич и для расстановки, и для шага: кто, куда и когда может — условия фазы.
 * params: { fighterId, cellId, start } — start: true пишет и startPosition (расстановка).
 */
export const SET_FIGHTER_CELL = (partyState, action = {}) => {
  const { fighterId, cellId = null } = action;
  if (fighterId == null) throw new Error('SET_FIGHTER_CELL: нужен fighterId');

  const { player, fighter, index } = findFighter(partyState, fighterId);
  if (!fighter) {
    throw new Error(`SET_FIGHTER_CELL: боец "${fighterId}" не найден`);
  }

  if (cellId != null && !findNode(partyState, cellId)) {
    throw new Error(`SET_FIGHTER_CELL: клетка "${cellId}" не найдена на карте`);
  }

  const position = cellId ?? null;
  const next = { ...fighter, currentPosition: position };
  if (action.start === true) next.startPosition = position;
  player.fighters[index] = next;

  return partyState;
};

export default SET_FIGHTER_CELL;
