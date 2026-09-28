import { findOwnedFighter, findPlayer, playerHeroes, seatIndex } from '#shared/helpers/base.js';
import { occupiedCellIds } from '#shared/helpers/turn.js';

export const findNode = (partyState, cellId) => {
  const nodes = partyState.map?.nodes;
  if (!Array.isArray(nodes)) return null;
  return nodes.find(entry => String(entry.id) === String(cellId)) ?? null;
};

/**
 * Стихии клетки. Обычно одна, но у двух- и трёхцветных клеток их несколько: такая клетка
 * принадлежит сразу всем своим областям (стык зон, см. `docs/terrain.md`).
 */
export const nodeTerrains = node => {
  const raw = node?.terrain;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return list.filter(terrain => terrain != null && terrain !== '').map(terrain => String(terrain));
};

/** Основная стихия клетки — она и задаёт цвет заливки. */
export const nodeTerrain = node => nodeTerrains(node)[0] ?? null;

export const cellTerrains = (partyState, cellId) => {
  if (cellId == null) return [];
  return nodeTerrains(findNode(partyState, cellId));
};

export const cellTerrain = (partyState, cellId) => cellTerrains(partyState, cellId)[0] ?? null;

/** Общая область у двух клеток: у них есть хотя бы одна общая стихия. */
export const sharesArea = (partyState, leftCellId, rightCellId) => {
  const left = cellTerrains(partyState, leftCellId);
  if (left.length === 0) return false;
  const right = cellTerrains(partyState, rightCellId);
  return left.some(terrain => right.includes(terrain));
};

export const isNumberedCell = node => node?.heroStart === true;

/** Номерная клетка игрока: `heroStart` с номером места (`position` = порядок игрока). */
export const numberedCellId = (partyState, playerId) => {
  const seat = seatIndex(partyState, playerId);
  if (seat < 0) return null;
  const node = (partyState.map?.nodes ?? []).find(
    entry => isNumberedCell(entry) && Number(entry.position) === seat + 1,
  );
  return node?.id ?? null;
};

export const numberedCell = (partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  return cellId == null ? null : findNode(partyState, cellId);
};

/** Области номерной клетки героя: в них же расставляются его помощники. */
export const playerPlacementTerrains = (partyState, playerId) =>
  cellTerrains(partyState, numberedCellId(partyState, playerId));

/**
 * Клетки расстановки игрока: все клетки, у которых есть общая стихия с номерной клеткой героя.
 * Герой стоит на номерной клетке, помощники — в той же области (двухцветные клетки считаются
 * сразу в обеих своих областях).
 */
export const startAreaCellIds = (partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  if (cellId == null || cellTerrains(partyState, cellId).length === 0) return [];
  return (partyState.map?.nodes ?? [])
    .filter(node => node?.id != null && sharesArea(partyState, cellId, node.id))
    .map(node => String(node.id));
};

export const isPlacementAreaCell = (partyState, playerId, node) => {
  const cellId = numberedCellId(partyState, playerId);
  if (cellId == null || !node) return false;
  return sharesArea(partyState, cellId, node.id);
};

export const hasHeroOnNumberedCell = (partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  if (cellId == null) return false;
  const player = findPlayer(partyState, playerId);
  return playerHeroes(player).some(fighter => String(fighter.currentPosition) === String(cellId));
};

export const heroOnNumberedCell = (partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  if (cellId == null) return null;
  const player = findPlayer(partyState, playerId);
  return (
    playerHeroes(player).find(fighter => String(fighter.currentPosition) === String(cellId)) ?? null
  );
};

export const isLockedHero = (fighter, partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  if (cellId == null || fighter?.type !== 'hero') return false;
  return String(fighter.currentPosition) === String(cellId);
};

/** Почему героя нельзя поставить на номерную клетку (фаза pickNumHero); null — можно. */
export const numberPickRejection = (partyState, playerId, fighterId) => {
  const player = findPlayer(partyState, playerId);
  if (!player) return `игрок ${playerId} не найден`;
  if (player.placementReady) return 'расстановка уже подтверждена';

  const { fighter } = findOwnedFighter(partyState, playerId, fighterId);
  if (!fighter) return `боец ${fighterId} не ваш`;
  if (fighter.type !== 'hero') return 'на номерную клетку ставят только героя';
  if (numberedCellId(partyState, playerId) == null) {
    return 'у игрока нет номерной клетки';
  }

  return null;
};

/** Почему бойца нельзя поставить в область героя (фаза place); null — можно. */
export const placementRejection = (partyState, playerId, fighterId, cellId) => {
  const player = findPlayer(partyState, playerId);
  if (!player) return `игрок ${playerId} не найден`;
  if (player.placementReady) return 'расстановка уже подтверждена';
  if (cellId == null) return 'нужна клетка';

  const node = findNode(partyState, cellId);
  if (!node) return `клетка ${cellId} не найдена на карте`;

  const { fighter } = findOwnedFighter(partyState, playerId, fighterId);
  if (!fighter) return `боец ${fighterId} не ваш`;
  if (isLockedHero(fighter, partyState, playerId)) {
    return 'главного героя на номерной клетке двигать нельзя';
  }
  if (!isPlacementAreaCell(partyState, playerId, node)) {
    const allowed = startAreaCellIds(partyState, playerId).join(', ') || '—';
    return `клетки в одной области с героем: ${allowed}`;
  }
  if (String(fighter.currentPosition) === String(node.id)) {
    return 'боец уже на этой клетке';
  }
  // клетка одна на всех: две стороны расставляются в своих областях одновременно
  if (occupiedCellIds(partyState, fighter.id).has(String(node.id))) {
    return `клетка ${node.id} уже занята`;
  }

  return null;
};

export const clearHeroOnNumberedCell = (partyState, playerId) => {
  const cellId = numberedCellId(partyState, playerId);
  if (cellId == null) return partyState;
  const player = findPlayer(partyState, playerId);
  if (!player) return partyState;
  player.fighters = (player.fighters ?? []).map(fighter => {
    if (fighter.type === 'hero' && String(fighter.currentPosition) === String(cellId)) {
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
export const placePhaseHighlightedCellIds = (partyState, playerId, selectedFighterId) => {
  if (selectedFighterId == null) return [];

  const player = findPlayer(partyState, playerId);
  if (!player || player.placementReady) return [];

  const fighter = (player.fighters ?? []).find(
    entry => String(entry.id) === String(selectedFighterId),
  );
  if (!fighter || isLockedHero(fighter, partyState, playerId)) return [];

  const allowed = startAreaCellIds(partyState, playerId);
  const blocked = occupiedCellIds(partyState, fighter.id);
  return allowed
    .filter(
      cellId => !blocked.has(String(cellId)) && String(cellId) !== String(fighter.currentPosition),
    )
    .map(String);
};
