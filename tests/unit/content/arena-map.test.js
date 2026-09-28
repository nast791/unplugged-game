import { describe, expect, it } from 'vitest';
import { createGame } from '../../../server/create.js';
import { load } from '../../../server/party.js';
import arena from '../../../server/content/maps/arena.js';
import { TERRAIN_IDS } from '#shared/constants/terrain.js';
import { SEAT_SIDES } from '#shared/constants/seats.js';
import { CELL_STEP } from '#shared/helpers/mapGenerator.js';
import { nodeTerrains, numberedCellId, startAreaCellIds } from '#shared/helpers/placement.js';

/**
 * Карта должна быть играбельной для любой пары героев и честной по данным:
 * у каждой клетки стихия из палитры (у цветных — две или три, но таких клеток мало),
 * герой встаёт на номерную клетку своего места, а помощники — в его области, поэтому
 * клеток этой области должно хватать на всех бойцов игрока. Граф связный и симметричный.
 */
const create = heroes => {
  createGame(
    {
      mapId: 'arena',
      mode: 'hotseat',
      heroes: heroes.map((heroId, index) => ({
        heroId,
        team: index === 0 ? 'A' : 'B',
        order: index + 1,
        control: 'human',
      })),
    },
    { testId: `map_${heroes.join('_')}`, testSeed: 7 },
  );
  return load(`map_${heroes.join('_')}`);
};

const nodes = arena.nodes;
const multiColor = nodes.filter(node => nodeTerrains(node).length > 1);

describe('карта arena: стихии и области расстановки', () => {
  it('у каждой клетки от одной до трёх стихий из палитры, без повторов', () => {
    for (const node of nodes) {
      const terrains = nodeTerrains(node);
      expect(terrains.length, `клетка ${node.id}`).toBeGreaterThanOrEqual(1);
      expect(terrains.length, `клетка ${node.id}`).toBeLessThanOrEqual(3);
      for (const terrain of terrains) {
        expect(TERRAIN_IDS, `клетка ${node.id}`).toContain(terrain);
      }
      expect(new Set(terrains).size, `клетка ${node.id}`).toBe(terrains.length);
    }
  });

  it('двух- и трёхцветные клетки есть, но их немного', () => {
    expect(multiColor.length).toBeGreaterThanOrEqual(2);
    expect(multiColor.some(node => nodeTerrains(node).length === 3)).toBe(true);
    expect(multiColor.length).toBeLessThanOrEqual(Math.ceil(nodes.length / 4));
  });

  it('у каждого игрока хватает клеток в области героя на всех своих бойцов', () => {
    for (const heroes of [
      ['medusa', 'tesla'],
      ['tesla', 'medusa'],
    ]) {
      const state = create(heroes);
      for (const player of state.players) {
        const cells = startAreaCellIds(state, player.id);
        expect(
          cells.length,
          `${player.heroId}: клеток области ${cells.length}, бойцов ${player.fighters.length}`,
        ).toBeGreaterThanOrEqual(player.fighters.length);
      }
    }
  });

  it('номерная клетка ровно одна на место игрока', () => {
    const state = create(['medusa', 'tesla']);

    for (const player of state.players) {
      const cellId = numberedCellId(state, player.id);
      expect(cellId).not.toBeNull();
      expect(startAreaCellIds(state, player.id)).toContain(String(cellId));
    }

    expect(nodes.filter(node => node.heroStart === true)).toHaveLength(2);
  });

  it('старты стоят по своим сторонам: место 1 — слева, место 2 — справа', () => {
    const xs = nodes.map(node => node.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);

    for (const node of nodes.filter(entry => entry.heroStart === true)) {
      const side = SEAT_SIDES[node.position];
      const edge = side === 'left' ? node.x - minX : maxX - node.x;
      expect(edge, `клетка ${node.id}, место ${node.position} (${side})`).toBeLessThanOrEqual(
        CELL_STEP * 1,
      );
    }
  });

  it('области героев не совпадают: игроки не расставляются в одной области', () => {
    const state = create(['medusa', 'tesla']);
    const medusaCells = startAreaCellIds(state, 'medusa');
    const teslaCells = startAreaCellIds(state, 'tesla');

    expect(medusaCells.filter(id => teslaCells.includes(id))).toEqual([]);
  });

  it('клетки крупные и не наезжают друг на друга', () => {
    const radius = (arena.settings?.nodeSize ?? 96) / 2;
    const byId = new Map(nodes.map(node => [node.id, node]));
    for (const node of nodes) {
      for (const neighborId of node.neighbors) {
        const other = byId.get(neighborId);
        expect(
          Math.hypot(other.x - node.x, other.y - node.y),
          `клетки ${node.id} и ${neighborId}`,
        ).toBeGreaterThanOrEqual(radius * 2);
      }
    }
  });

  it('соединители короткие и не проходят сквозь третьи клетки', () => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const distanceToSegment = (point, left, right) => {
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const lengthSquared = dx * dx + dy * dy || 1;
      const t = Math.max(
        0,
        Math.min(1, ((point.x - left.x) * dx + (point.y - left.y) * dy) / lengthSquared),
      );
      return Math.hypot(point.x - (left.x + t * dx), point.y - (left.y + t * dy));
    };

    for (const node of nodes) {
      for (const neighborId of node.neighbors) {
        const other = byId.get(neighborId);
        // линия соединяет только соседние кружки: между ними нет третьего
        expect(Math.hypot(other.x - node.x, other.y - node.y)).toBeLessThanOrEqual(170);
        for (const third of nodes) {
          if (third === node || third === other) continue;
          expect(
            distanceToSegment(third, node, other),
            `линия ${node.id}-${neighborId} рядом с ${third.id}`,
          ).toBeGreaterThanOrEqual(50);
        }
      }
    }
  });

  it('карта связная, соседи существуют и связи взаимные', () => {
    const ids = new Set(nodes.map(node => node.id));

    for (const node of nodes) {
      expect(node.neighbors.length).toBeGreaterThan(0);
      for (const neighbor of node.neighbors) {
        expect(ids.has(neighbor), `клетка ${node.id} ссылается на ${neighbor}`).toBe(true);
        const back = nodes.find(entry => entry.id === neighbor);
        expect(back.neighbors, `${neighbor} → ${node.id}`).toContain(node.id);
      }
    }

    const seen = new Set([nodes[0].id]);
    const queue = [nodes[0]];
    while (queue.length) {
      const node = queue.shift();
      for (const neighbor of node.neighbors) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        queue.push(nodes.find(entry => entry.id === neighbor));
      }
    }
    expect(seen.size).toBe(nodes.length);
  });
});
