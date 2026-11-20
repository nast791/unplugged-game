import { describe, expect, it } from 'vitest';
import { isTerrainId } from '#shared/constants/terrain.js';
import { heroes } from '../../../server/content/index.js';
import { load } from '../../../server/party.js';
import { createGame } from '../../../server/create.js';

/**
 * `terrainAffinity` — данные героя: какие стихии ему «свои». Генератор включает их в набор земель
 * карты, но старт к ним не привязывает и площади не увеличивает (`.docs/terrain.md`). Значит опечатка
 * в id стихии не падала бы — тест её ловит.
 */
describe('стихии героя: terrainAffinity объявлен известными id', () => {
  it('каждая стихия героя существует в палитре', () => {
    for (const hero of Object.values(heroes)) {
      for (const terrain of hero.terrainAffinity ?? []) {
        expect(isTerrainId(terrain), `${hero.id}: неизвестная стихия «${terrain}»`).toBe(true);
      }
    }
  });

  it('у Снежной королевы это лёд', () => {
    expect(heroes['snow-queen'].terrainAffinity).toEqual(['ice']);
  });

  it('у Ифрита это лава и пустыня: иначе его карты молчат', () => {
    expect(heroes.ifrit.terrainAffinity).toEqual(['lava', 'desert']);
  });
});

/**
 * Поле партии собирается из паков героев (`server/create.js`: `affinities`), поэтому забытое поле
 * в паке видно не в генераторе, а здесь: Ифрит без `terrainAffinity` играл на карте без лавы.
 */
describe('земля героя доезжает до поля партии', () => {
  it('партия с Ифритом ставит на карту лаву и пустыню', () => {
    createGame(
      {
        mapId: 'generated',
        mode: 'hotseat',
        heroes: [
          { heroId: 'ifrit', team: 'A', order: 1, control: 'human' },
          { heroId: 'tesla', team: 'B', order: 2, control: 'human' },
        ],
      },
      { testId: 'test_hero_affinity_map', testSeed: 11 },
    );
    const state = load('test_hero_affinity_map');
    const terrains = new Set(
      state.map.nodes.flatMap(node =>
        Array.isArray(node.terrain) ? node.terrain : [node.terrain],
      ),
    );

    expect([...terrains]).toEqual(expect.arrayContaining(['lava', 'desert']));
  });
});
