import { findPlayer } from '#shared/helpers/base.js';
import { fighterMatchesBinding } from '#shared/helpers/cards.js';
import { findNode } from '#shared/helpers/placement.js';
import { occupiedCellIds } from '#shared/helpers/turn.js';
/**
 * REVIVE_FIGHTER — вернуть убитого бойца на поле: боец берётся из `player.lost`, получает полное
 * здоровье и встаёт на свободную клетку. Так работает «воскресите убитую Гарпию» (`medusa_11`).
 * params: { playerId, group, cellId }
 * Привязка `group` — id/группа бойца (как `card.fighter`), чтобы не поднять не того, кого нужно.
 * params: { playerId, group, cellId }
 */
export const REVIVE_FIGHTER = (partyState, action = {}) => {
  const playerId = action.playerId ?? partyState.turn?.playerId;
  const player = findPlayer(partyState, playerId);
  if (!player) throw new Error(`REVIVE_FIGHTER: игрок ${playerId} не найден`);

  const lost = player.lost ?? [];
  const index = lost.findIndex(fighter => fighterMatchesBinding(fighter, action.group ?? null));
  if (index < 0) {
    throw new Error(`REVIVE_FIGHTER: у игрока ${playerId} нет убитого бойца "${action.group}"`);
  }

  // выбранная цель приходит из правила как `$picked`, а факт PICKED отдаёт список — берём первую клетку
  const rawCellId = Array.isArray(action.cellId) ? action.cellId[0] : action.cellId;
  const cellId = rawCellId == null ? null : String(rawCellId);
  if (cellId == null || cellId === '') {
    throw new Error('REVIVE_FIGHTER: нужна клетка (cellId)');
  }
  if (!findNode(partyState, cellId)) {
    throw new Error(`REVIVE_FIGHTER: клетка ${cellId} не найдена на карте`);
  }
  if (occupiedCellIds(partyState).has(cellId)) {
    throw new Error(`REVIVE_FIGHTER: клетка ${cellId} занята`);
  }

  const [fighter] = lost.splice(index, 1);
  const hp = Number(fighter.startHp) || Number(fighter.currentHp) || 1;

  player.lost = lost;
  player.fighters = [...player.fighters, { ...fighter, currentHp: hp, currentPosition: cellId }];

  return partyState;
};

export default REVIVE_FIGHTER;
