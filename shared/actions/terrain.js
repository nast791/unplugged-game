import { isTerrainId } from '#shared/constants/terrain.js';
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

/**
 * Добавить клетке временную стихию («Три обещания» Ифрита): она лежит отдельно от `terrain`,
 * поэтому основная стихия и цвет клетки не меняются, а правила читают её через `nodeAllTerrains`.
 * Больше трёх стихий на клетке не бывает, повтор уже стоящей стихии не добавляется.
 */
export const addTemporaryTerrain = (partyState, cellId, terrain) => {
  if (cellId == null || terrain == null || terrain === '') return partyState;
  const key = String(terrain);
  if (!isTerrainId(key)) {
    throw new Error(`SET_CELL_TERRAIN: неизвестная стихия "${key}"`);
  }
  const node = findNode(partyState, cellId);
  if (!node) throw new Error(`SET_CELL_TERRAIN: клетка ${cellId} не найдена`);

  const current = nodeAllTerrains(node);
  if (current.includes(key) || current.length >= MAX_CELL_TERRAINS) return partyState;

  return replaceNode(partyState, cellId, {
    ...node,
    extraTerrain: [...(Array.isArray(node.extraTerrain) ? node.extraTerrain : []), key],
  });
};

/** Снять все временные стихии: конец хода игрока, чьё правило их поставило. */
export const clearTemporaryTerrains = partyState => {
  const nodes = partyState.map?.nodes;
  if (!Array.isArray(nodes) || !nodes.some(node => node?.extraTerrain != null)) {
    return partyState;
  }

  partyState.map = {
    ...partyState.map,
    nodes: nodes.map(node => {
      if (node?.extraTerrain == null) return node;
      const copy = { ...node };
      delete copy.extraTerrain;
      return copy;
    }),
  };
  return partyState;
};

/**
 * SET_CELL_TERRAIN — временная стихия клетки. params: { op?: 'add' | 'clear', cellId?, terrain? }.
 * `clear` без `cellId` снимает все временные стихии (конец хода), `clear` с клеткой — только её.
 */
export const SET_CELL_TERRAIN = (partyState, action = {}) => {
  const op = action.op ?? 'add';

  if (op === 'add') return addTemporaryTerrain(partyState, action.cellId, action.terrain);
  if (op === 'clear') {
    if (action.cellId == null) return clearTemporaryTerrains(partyState);
    const node = findNode(partyState, action.cellId);
    if (!node) throw new Error(`SET_CELL_TERRAIN: клетка ${action.cellId} не найдена`);
    if (node.extraTerrain == null) return partyState;
    const next = { ...node };
    delete next.extraTerrain;
    return replaceNode(partyState, action.cellId, next);
  }

  throw new Error(`SET_CELL_TERRAIN: op "${op}" (нужны add | clear)`);
};

export default SET_CELL_TERRAIN;
