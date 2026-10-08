import { findFighter } from '#shared/helpers/base.js';
import { findNode } from '#shared/helpers/placement.js';

/**
 * SET_FIGHTER_CELL — позиция бойца: поставить на клетку или снять с поля (cellId = null).
 * Один кирпич и для расстановки, и для шага: кто, куда и когда может — условия фазы.
 * params: { fighterId, cellId, start, teleport } — start: true пишет и startPosition (расстановка),
 * teleport: true — постановка без прохода (обмен местами, возврат, карта-телепорт): движением
 * не считается и `movedThisTurn` не ставит (правило владельца).
 */
export const SET_FIGHTER_CELL = (partyState, action = {}) => {
  // выбранная цель приходит из правила как `$picked`, а факт PICKED отдаёт список — берём первую клетку
  // (так же разбирает клетку REVIVE_FIGHTER). Само значение не приводим: у карт-задач id клеток числовые
  const cellId = Array.isArray(action.cellId)
    ? (action.cellId[0] ?? null)
    : (action.cellId ?? null);
  const { fighterId } = action;
  if (fighterId == null) throw new Error('SET_FIGHTER_CELL: нужен fighterId');

  const { player, fighter, index } = findFighter(partyState, fighterId);
  if (!fighter) {
    throw new Error(`SET_FIGHTER_CELL: боец "${fighterId}" не найден`);
  }

  if (cellId != null && !findNode(partyState, cellId)) {
    throw new Error(`SET_FIGHTER_CELL: клетка "${cellId}" не найдена на карте`);
  }

  // «заморожен» запрещает и шаг, и телепорт: статус ставит карта со свойством, снимает его конец хода
  if (action.start !== true && fighter.frozen === true) {
    throw new Error(`SET_FIGHTER_CELL: боец "${fighterId}" заморожен`);
  }

  const position = cellId ?? null;
  const moved = position != null && String(position) !== String(fighter.currentPosition ?? '');
  const next = { ...fighter, currentPosition: position };
  if (action.start === true) next.startPosition = position;
  // шаг по полю (не расстановка и не телепорт) помечает бойца: «двигался в этом ходу» — условие
  // «Наотмаши», «Разбега» и умения Анубиса
  if (action.start !== true && action.teleport !== true && moved) next.movedThisTurn = true;
  player.fighters[index] = next;

  return partyState;
};

export default SET_FIGHTER_CELL;
