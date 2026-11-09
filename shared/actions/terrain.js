import { isTerrainId } from '#shared/constants/terrain.js';
import { findFighter } from '#shared/helpers/base.js';
import { findNode, nodeAllTerrains } from '#shared/helpers/placement.js';

const MAX_CELL_TERRAINS = 3;

/** Заменить одну клетку в карте, не трогая остальные: `map` — общий объект форка. */
const replaceNode = (partyState, cellId, nextNode) => {
  const map = partyState.map;
  if (!map || !Array.isArray(map.nodes)) {
    throw new Error(`SET_CELL_TERRAIN: карты нет`);
  }
  partyState.map = {
    ...map,
    nodes: map.nodes.map(node => (String(node.id) === String(cellId) ? nextNode : node)),
  };
  return partyState;
};

/** Клетка по id или по бойцу на ней: `cellId` принимает и ссылку на бойца из факта. */
const resolveNode = (partyState, cellId) => {
  const node = findNode(partyState, cellId);
  if (node) return node;
  const { fighter } = findFighter(partyState, cellId);
  return fighter?.currentPosition == null ? null : findNode(partyState, fighter.currentPosition);
};

/**
 * Добавить клетке временную стихию: она лежит отдельно от `terrain`, а правила читают её через
 * `nodeAllTerrains`. Владелец добавки — чьё правило её поставило, его конец хода её и снимает.
 */
export const addTemporaryTerrain = (partyState, cellId, terrain, ownerId) => {
  if (cellId == null || terrain == null || terrain === '') return partyState;
  const key = String(terrain);
  if (!isTerrainId(key)) {
    throw new Error(`SET_CELL_TERRAIN: неизвестная стихия "${key}"`);
  }
  const node = resolveNode(partyState, cellId);
  if (!node) throw new Error(`SET_CELL_TERRAIN: клетка или боец ${cellId} не найдены`);

  const current = nodeAllTerrains(node);
  if (current.includes(key) || current.length >= MAX_CELL_TERRAINS) return partyState;

  return replaceNode(partyState, node.id, {
    ...node,
    extraTerrain: [...(Array.isArray(node.extraTerrain) ? node.extraTerrain : []), key],
    ...(ownerId == null ? {} : { extraTerrainBy: String(ownerId) }),
  });
};

/**
 * Снять временные стихии по владельцу: `ownerId` — чей ход кончился, без него снимаются все.
 * Добавку без владельца движок не создаёт, поэтому её снимает любой конец хода.
 */
export const clearTemporaryTerrains = (partyState, ownerId) => {
  const nodes = partyState.map?.nodes;
  const owner = ownerId == null ? null : String(ownerId);
  const owns = node =>
    node?.extraTerrain != null &&
    (owner == null || node.extraTerrainBy == null || String(node.extraTerrainBy) === owner);

  if (!Array.isArray(nodes) || !nodes.some(owns)) return partyState;

  partyState.map = {
    ...partyState.map,
    nodes: nodes.map(node => {
      if (!owns(node)) return node;
      const copy = { ...node };
      delete copy.extraTerrain;
      delete copy.extraTerrainBy;
      return copy;
    }),
  };
  return partyState;
};

/**
 * SET_CELL_TERRAIN — временная стихия клетки. params: { op?: 'add' | 'clear', cellId?, terrain? }.
 * `cellId` — клетка или боец на ней; `clear` без `cellId` снимает добавки ставящего правила.
 */
export const SET_CELL_TERRAIN = (partyState, action = {}) => {
  const op = action.op ?? 'add';

  if (op === 'add') {
    return addTemporaryTerrain(partyState, action.cellId, action.terrain, action.playerId);
  }
  if (op === 'clear') {
    if (action.cellId == null) return clearTemporaryTerrains(partyState, action.playerId);
    const node = resolveNode(partyState, action.cellId);
    if (!node) throw new Error(`SET_CELL_TERRAIN: клетка или боец ${action.cellId} не найдены`);
    if (node.extraTerrain == null) return partyState;
    const next = { ...node };
    delete next.extraTerrain;
    delete next.extraTerrainBy;
    return replaceNode(partyState, node.id, next);
  }

  throw new Error(`SET_CELL_TERRAIN: op "${op}" (нужны add | clear)`);
};

export default SET_CELL_TERRAIN;
