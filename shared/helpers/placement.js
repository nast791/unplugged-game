import { findPlayer, occupiedOwnCellIds, playerHeroes, seatIndex } from '#shared/helpers/base.js';

export const findNode = (partyState, cellId) => {
  const nodes = partyState.map?.nodes;
  if (!Array.isArray(nodes)) return null;
  return nodes.find(entry => String(entry.id) === String(cellId)) ?? null;
};

/** Id области клетки = первый цвет в node.areas (одинаковый цвет = одна область). */
export const nodeAreaId = node => {
  const areas = node?.areas;
  if (!Array.isArray(areas) || areas.length === 0) return null;
  return String(areas[0]);
};

export const areaIdAtCell = (partyState, cellId) => {
  if (cellId == null) return null;
  return nodeAreaId(findNode(partyState, cellId));
};

/** Стартовая область: node.position === seatIndex + 1 */
export const isStartAreaForPlayer = (node, seat) => {
  if (node?.position == null || seat < 0) return false;
  return Number(node.position) === Number(seat) + 1;
};

export const isNumberedCell = node => node?.heroStart === true;

/** Номерная клетка (heroStart) в стартовой зоне игрока. */
export const numberedCellId = (partyState, playerId) => {
  const seat = seatIndex(partyState, playerId);
  const node = (partyState.map?.nodes ?? []).find(
    entry =>
      isStartAreaForPlayer(entry, seat) && isNumberedCell(entry),
  );
  return node?.id ?? null;
};

export const numberedCell = (partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  return cellId == null ? null : findNode(partyState, cellId);
};

export const hasHeroOnNumberedCell = (partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  if (cellId == null) return false;
  const player = findPlayer(partyState, playerId);
  return playerHeroes(player).some(
    fighter => String(fighter.currentPosition) === String(cellId),
  );
};

export const heroOnNumberedCell = (partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  if (cellId == null) return null;
  const player = findPlayer(partyState, playerId);
  return (
    playerHeroes(player).find(
      fighter => String(fighter.currentPosition) === String(cellId),
    ) ?? null
  );
};

export const isLockedHero = (fighter, partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  if (cellId == null || fighter?.type !== 'hero') return false;
  return String(fighter.currentPosition) === String(cellId);
};

/** Цвет области расстановки = цвет номерной клетки игрока. */
export const playerPlacementAreaId = (partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  if (cellId == null) return null;
  return areaIdAtCell(partyState, cellId);
};

/** Клетка в области расстановки: тот же цвет (areas[0]), что у номерной клетки. */
export const isPlacementAreaCell = (partyState, playerId, node) => {
  const areaId = playerPlacementAreaId(partyState, playerId);
  if (areaId == null || !node) return false;
  return nodeAreaId(node) === areaId;
};

/** Все клетки области расстановки (один цвет с номерной клеткой). */
export const startAreaCellIds = (partyState, playerId) => {
  const areaId = playerPlacementAreaId(partyState, playerId);
  if (areaId == null) return [];
  return (partyState.map?.nodes ?? [])
    .filter(node => nodeAreaId(node) === areaId)
    .map(node => node.id);
};

export const setFighterCell = (player, fighterIndex, cellId) => {
  const fighter = player.fighters[fighterIndex];
  player.fighters[fighterIndex] = {
    ...fighter,
    currentPosition: cellId,
    startPosition: cellId,
  };
};

export const clearHeroOnNumberedCell = (partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  if (cellId == null) return partyState;
  const player = findPlayer(partyState, playerId);
  if (!player) return partyState;
  player.fighters = (player.fighters ?? []).map(fighter => {
    if (
      fighter.type === 'hero' &&
      String(fighter.currentPosition) === String(cellId)
    ) {
      return { ...fighter, currentPosition: null, startPosition: null };
    }
    return fighter;
  });
  return partyState;
};

export const playerFightersPlaced = player => {
  if (!Array.isArray(player?.fighters) || player.fighters.length === 0) {
    return true;
  }
  return player.fighters.every(fighter => fighter.currentPosition != null);
};

export const allPlayersPlacementReady = partyState =>
  (partyState.players ?? []).every(player => {
    if (!Array.isArray(player.fighters) || player.fighters.length === 0) {
      return true;
    }
    return player.placementReady === true && playerFightersPlaced(player);
  });

export const hasPickPreview = (partyState, playerId) => {
  const player = findPlayer(partyState, playerId);
  if (!player || player.numberedHeroCommitted) return false;
  return hasHeroOnNumberedCell(partyState, playerId);
};

/** Подсветка клеток в phase place (нужен selectedFighterId в clientContext). */
export const placePhaseHighlightedCellIds = (
  partyState,
  playerId,
  selectedFighterId,
) => {
  if (selectedFighterId == null) return [];

  const player = findPlayer(partyState, playerId);
  if (!player || player.placementReady) return [];

  const fighter = (player.fighters ?? []).find(
    entry => String(entry.id) === String(selectedFighterId),
  );
  if (!fighter || isLockedHero(fighter, partyState, playerId)) return [];

  const allowed = startAreaCellIds(partyState, playerId);
  const blocked = occupiedOwnCellIds(player, fighter.id);
  return allowed
    .filter(
      cellId =>
        !blocked.has(String(cellId)) &&
        String(cellId) !== String(fighter.currentPosition),
    )
    .map(String);
};
