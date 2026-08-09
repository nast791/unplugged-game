import { findOwnedFighter, findPlayer, occupiedOwnCellIds } from '#shared/helpers/base.js';
import {
  clearHeroOnNumberedCell,
  findNode,
  isLockedHero,
  isPlacementAreaCell,
  numberedCellId,
  setFighterCell,
  startAreaCellIds,
} from '#shared/helpers/placement.js';

/**
 * PLACE_FIGHTER — поставить бойца (hero или assistant) на клетку.
 * zone: 'numbered' | 'area' | 'any'
 * preview: true — preview на numbered (без numberedHeroCommitted)
 */
export const PLACE_FIGHTER = (partyState, action) => {
  const playerId = action.playerId;
  const fighterId = action.fighterId;
  const zone = action.zone ?? 'area';
  const preview = action.preview === true;

  let cellId = action.cellId;
  if (zone === 'numbered') {
    cellId = numberedCellId(partyState, playerId);
  }

  if (fighterId == null || cellId == null) {
    throw new Error('PLACE_FIGHTER: нужны fighterId и cellId');
  }

  const player = findPlayer(partyState, playerId);
  if (!player) {
    throw new Error(`PLACE_FIGHTER: игрок ${playerId} не найден`);
  }
  if (!preview && player.placementReady) {
    throw new Error('PLACE_FIGHTER: расстановка уже подтверждена');
  }

  const { fighter, index } = findOwnedFighter(partyState, playerId, fighterId);
  if (!fighter) {
    throw new Error(
      `PLACE_FIGHTER: fighter "${fighterId}" не принадлежит игроку ${playerId}`,
    );
  }

  if (zone === 'numbered') {
    if (fighter.type !== 'hero') {
      throw new Error('PLACE_FIGHTER: на номерную клетку — только герой');
    }
    let state = clearHeroOnNumberedCell(partyState, playerId);
    const numberedPlayer = findPlayer(state, playerId);
    const owned = findOwnedFighter(state, playerId, fighterId);
    setFighterCell(numberedPlayer, owned.index, cellId);
    return state;
  }

  if (isLockedHero(fighter, partyState, playerId)) {
    throw new Error('PLACE_FIGHTER: главного героя на номерной клетке двигать нельзя');
  }

  const node = findNode(partyState, cellId);
  if (!node) {
    throw new Error(`PLACE_FIGHTER: клетка "${cellId}" не найдена на карте`);
  }

  if (zone === 'area' && !isPlacementAreaCell(partyState, playerId, node)) {
    const allowed = startAreaCellIds(partyState, playerId).join(', ') || '—';
    throw new Error(`PLACE_FIGHTER: клетки области расстановки: ${allowed}`);
  }

  if (zone === 'any' && !partyState.map?.nodes?.some(entry => String(entry.id) === String(cellId))) {
    throw new Error(`PLACE_FIGHTER: клетка "${cellId}" недоступна`);
  }

  if (String(fighter.currentPosition) === String(node.id)) {
    throw new Error('PLACE_FIGHTER: fighter уже на этой клетке');
  }

  const blocked = occupiedOwnCellIds(player, fighterId);
  if (blocked.has(String(node.id))) {
    throw new Error(`PLACE_FIGHTER: клетка ${cellId} уже занята вашим бойцом`);
  }

  setFighterCell(player, index, node.id);
  return partyState;
};

export default PLACE_FIGHTER;
