import { describe, expect, it } from 'vitest';
import { TERRAIN, TERRAIN_IDS, terrainColor, terrainPattern } from '#shared/constants/terrain.js';
import { runFact } from '#shared/facts/run.js';
import {
  cellTerrain,
  cellTerrains,
  nodeTerrain,
  nodeTerrains,
  numberedCellId,
  placementRejection,
  playerPlacementTerrains,
  sharesArea,
  startAreaCellIds,
} from '#shared/helpers/placement.js';
import { createState } from '../../fixtures/state.js';

/**
 * Миникарта со стихиями (герой встаёт на номерную клетку, помощники — в его области):
 *   1(forest, номерная игрока 0) — 2(forest+water, двухцветная) — 3(water) — 4(water)
 *   5(lava, номерная игрока 1)
 */
const terrainMap = {
  id: 'terrain-test',
  nodes: [
    { id: 1, neighbors: [2, 3], terrain: 'forest', heroStart: true, position: 1 },
    { id: 2, neighbors: [1, 3], terrain: ['forest', 'water'] },
    { id: 3, neighbors: [2, 4], terrain: 'water' },
    { id: 4, neighbors: [3, 5], terrain: 'water' },
    { id: 5, neighbors: [4], terrain: 'lava', heroStart: true, position: 2 },
  ],
};

/** Alpha (герой игрока 0) на номерной клетке 1, помощник — на двухцветной 2, Beta — на 5. */
const terrainState = () => {
  const state = createState({ map: structuredClone(terrainMap) });
  const alpha = state.players[0].fighters;
  alpha[0].currentPosition = 1;
  alpha[1].currentPosition = 2;
  state.players[1].fighters[0].currentPosition = 5;
  return state;
};

describe('стихии: палитра', () => {
  it('шесть стихий, у каждой свой цвет и свой узор', () => {
    expect(TERRAIN_IDS).toEqual(['ice', 'forest', 'mountains', 'lava', 'desert', 'water']);
    const colors = new Set(TERRAIN_IDS.map(terrainColor));
    expect(colors.size).toBe(TERRAIN_IDS.length);
    for (const id of TERRAIN_IDS) expect(terrainPattern(id), id).toBeTruthy();
    expect(Object.keys(TERRAIN)).toHaveLength(6);
  });

  it('неизвестной стихии не существует: это ошибка, а не повод что-то подставить', () => {
    expect(() => terrainColor('нет-такой')).toThrow(/Неизвестная стихия/);
    expect(() => terrainColor(undefined)).toThrow(/Неизвестная стихия/);
    expect(() => terrainPattern('нет-такой')).toThrow(/Неизвестная стихия/);
  });
});

describe('стихии: данные клеток', () => {
  it('у обычной клетки одна стихия, у цветной — две, первая задаёт заливку', () => {
    const state = terrainState();
    expect(nodeTerrains(terrainMap.nodes[0])).toEqual(['forest']);
    expect(nodeTerrains(terrainMap.nodes[1])).toEqual(['forest', 'water']);
    expect(nodeTerrain(terrainMap.nodes[1])).toBe('forest');

    expect(cellTerrains(state, 2)).toEqual(['forest', 'water']);
    expect(cellTerrain(state, 2)).toBe('forest');
    expect(cellTerrains(state, 99)).toEqual([]);
    expect(cellTerrain(state, 99)).toBeNull();
  });

  it('двухцветная клетка состоит в обеих своих областях', () => {
    const state = terrainState();
    expect(sharesArea(state, 2, 1)).toBe(true); // общий лес
    expect(sharesArea(state, 2, 3)).toBe(true); // общая вода
    expect(sharesArea(state, 1, 3)).toBe(false); // лес против болота
    expect(sharesArea(state, 1, 5)).toBe(false);
    expect(sharesArea(state, 4, 3)).toBe(true);
  });
});

describe('стихии: расстановка в области героя', () => {
  it('номерная клетка ищется по месту игрока, область — по её стихиям', () => {
    const state = terrainState();
    expect(numberedCellId(state, '0')).toBe(1);
    expect(numberedCellId(state, '1')).toBe(5);
    expect(playerPlacementTerrains(state, '0')).toEqual(['forest']);
    expect(playerPlacementTerrains(state, '1')).toEqual(['lava']);
  });

  it('клетки расстановки — все клетки с общей стихией у номерной клетки', () => {
    const state = terrainState();
    expect(startAreaCellIds(state, '0')).toEqual(['1', '2']);
    expect(startAreaCellIds(state, '1')).toEqual(['5']);
  });

  it('помощника пускают в область героя, а в чужую — нет', () => {
    const state = terrainState();
    state.players[0].placementReady = false;
    state.players[0].fighters[1].currentPosition = null;

    expect(placementRejection(state, '0', 'pawn', 2)).toBeNull();
    expect(placementRejection(state, '0', 'pawn', 3)).toMatch(/одной области/);
    expect(placementRejection(state, '0', 'pawn', 5)).toMatch(/одной области/);
  });
});

describe('стихии: факты CELLS и FIGHTERS', () => {
  it('CELLS: фильтр по стихии видит и двухцветные клетки', () => {
    const state = terrainState();
    expect(runFact(state, 'CELLS', { terrain: 'water', free: false }).value).toEqual([
      '2',
      '3',
      '4',
    ]);
    expect(runFact(state, 'CELLS', { terrain: 'forest', free: false }).value).toEqual(['1', '2']);
  });

  it('FIGHTERS: фильтр по стихии и поле terrain в ответе', () => {
    const state = terrainState();
    const water = runFact(state, 'FIGHTERS', { terrain: 'water' });
    expect(water.value.map(entry => entry.fighterId)).toEqual(['pawn']);
    expect(water.value[0].terrain).toBe('forest');

    const lava = runFact(state, 'FIGHTERS', { terrain: 'lava' });
    expect(lava.value.map(entry => entry.fighterId)).toEqual(['beta']);
  });

  it('FIGHTERS: areaOf считает двухцветную клетку в двух областях', () => {
    const state = terrainState();
    expect(
      runFact(state, 'FIGHTERS', { side: 'any', areaOf: 'alpha' }).value.map(
        entry => entry.fighterId,
      ),
    ).toEqual(['alpha', 'pawn']);
    expect(
      runFact(state, 'FIGHTERS', { side: 'any', areaOf: 'beta' }).value.map(
        entry => entry.fighterId,
      ),
    ).toEqual(['beta']);
  });
});
