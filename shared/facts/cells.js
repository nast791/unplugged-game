import { cellTerrains, nodeTerrains, sharesArea } from '#shared/helpers/placement.js';
import { findFighter } from '#shared/helpers/base.js';
import { occupiedCellIds } from '#shared/helpers/turn.js';

/**
 * CELLS — клетки карты по фильтру. Нужно эффектам, которые ставят бойца на клетку:
 * «воскресите Гарпию на любой свободной клетке в области Медузы» (`medusa_11`).
 * params: { areaOf, terrain, free, min }
 * areaOf — в одной области с указанным бойцом (область = стихия его клетки, `docs/terrain.md`);
 * terrain — клетки конкретной стихии ('forest', 'water', 'lava', ...) или их список
 * (`['lava', 'desert']` — «Пепельный покров» Ифрита: годится и лава, и пустыня);
 * free — только свободные клетки (по умолчанию да).
 */
export const CELLS = (ctx, params = {}) => {
  const state = ctx.state ?? {};
  const nodes = state.map?.nodes ?? [];

  let pinnedCell = null;
  if (params.areaOf != null) {
    const { fighter } = findFighter(state, params.areaOf);
    if (!fighter || fighter.currentPosition == null) {
      return { ok: false, value: [] };
    }
    pinnedCell = fighter.currentPosition;
    if (cellTerrains(state, pinnedCell).length === 0) {
      return { ok: false, value: [] };
    }
  }

  const terrain =
    params.terrain == null
      ? null
      : (Array.isArray(params.terrain) ? params.terrain : [params.terrain]).map(String);
  const freeOnly = params.free !== false;
  const occupied = freeOnly ? occupiedCellIds(state) : new Set();

  const cells = nodes
    .filter(node => node?.id != null)
    .filter(
      node => terrain == null || nodeTerrains(node).some(value => terrain.includes(String(value))),
    )
    .filter(node => pinnedCell == null || sharesArea(state, pinnedCell, node.id))
    .map(node => String(node.id))
    .filter(cellId => !occupied.has(cellId));

  const min = params.min ?? 0;
  return { ok: cells.length >= min, value: cells };
};

export default CELLS;
