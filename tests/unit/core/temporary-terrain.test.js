import { describe, expect, it } from 'vitest';
import {
  SET_CELL_TERRAIN,
  addTemporaryTerrain,
  clearTemporaryTerrains,
} from '#shared/actions/terrain.js';
import { cellTerrains } from '#shared/helpers/placement.js';
import { createState } from '../../fixtures/state.js';

/** Линия 1—2—3: Alpha на 1, помощник на 2, Beta на 3. */
const map = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2], terrain: 'ice' },
  ],
};

const state = () => {
  const created = createState({ map: structuredClone(map) });
  created.players[0].fighters[0].currentPosition = 1;
  created.players[0].fighters[1].currentPosition = 2;
  created.players[1].fighters[0].currentPosition = 3;
  return created;
};

const nodeOf = (partyState, cellId) =>
  partyState.map.nodes.find(node => String(node.id) === String(cellId));

describe('временная стихия клетки: владелец и адрес', () => {
  it('клетку можно назвать бойцом: ставится на его клетку, а не по id бойца', () => {
    const after = SET_CELL_TERRAIN(state(), { cellId: 'pawn', terrain: 'lava', playerId: '0' });

    expect(nodeOf(after, 2)).toMatchObject({ terrain: 'ice', extraTerrain: ['lava'] });
    expect(cellTerrains(after, 2)).toEqual(['ice', 'lava']);
    expect(nodeOf(after, 1).extraTerrain).toBeUndefined();
  });

  it('список бойцов из факта тоже годится: берётся первый', () => {
    const partyState = state();
    const alpha = partyState.players[0].fighters[0];
    const after = addTemporaryTerrain(partyState, [{ fighterId: alpha.id }], 'lava', '0');

    expect(nodeOf(after, 1).extraTerrain).toEqual(['lava']);
  });

  it('добавка помнит владельца: чужой конец хода её не снимает', () => {
    const placed = SET_CELL_TERRAIN(state(), { cellId: 'pawn', terrain: 'lava', playerId: '0' });

    expect(nodeOf(placed, 2).extraTerrainBy).toBe('0');

    const enemyTurnOver = clearTemporaryTerrains(structuredClone(placed), '1');
    expect(nodeOf(enemyTurnOver, 2).extraTerrain).toEqual(['lava']);

    const ownTurnOver = clearTemporaryTerrains(structuredClone(placed), '0');
    expect(nodeOf(ownTurnOver, 2).extraTerrain).toBeUndefined();
    expect(nodeOf(ownTurnOver, 2).extraTerrainBy).toBeUndefined();
    expect(nodeOf(ownTurnOver, 2).terrain).toBe('ice');
  });

  it('без владельца снимаются все добавки: так зовёт общий сброс', () => {
    const placed = SET_CELL_TERRAIN(state(), { cellId: 'pawn', terrain: 'lava', playerId: '0' });

    const cleared = clearTemporaryTerrains(structuredClone(placed));

    expect(cleared.map.nodes.every(node => node.extraTerrain == null)).toBe(true);
  });

  it('три стихии — предел: четвёртая не добавляется', () => {
    const partyState = state();
    nodeOf(partyState, 2).terrain = ['ice', 'forest', 'desert'];

    const after = SET_CELL_TERRAIN(partyState, { cellId: 'pawn', terrain: 'lava', playerId: '0' });

    expect(nodeOf(after, 2).extraTerrain).toBeUndefined();
    expect(cellTerrains(after, 2)).toEqual(['ice', 'forest', 'desert']);
  });

  it('clear с бойцом снимает добавку только с его клетки', () => {
    const first = SET_CELL_TERRAIN(state(), { cellId: 'pawn', terrain: 'lava', playerId: '0' });
    const second = SET_CELL_TERRAIN(first, { cellId: 'alpha', terrain: 'forest', playerId: '0' });

    const after = SET_CELL_TERRAIN(second, { op: 'clear', cellId: 'pawn', playerId: '0' });

    expect(nodeOf(after, 2).extraTerrain).toBeUndefined();
    expect(nodeOf(after, 1).extraTerrain).toEqual(['forest']);
  });

  it('неизвестный адрес — ошибка, а не молчаливый пропуск', () => {
    expect(() => addTemporaryTerrain(state(), 'нет-такой', 'lava', '0')).toThrow(/не найдены/);
  });
});
