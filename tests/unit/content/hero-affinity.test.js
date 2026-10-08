import { describe, expect, it } from 'vitest';
import { isTerrainId } from '#shared/constants/terrain.js';
import { heroes } from '../../../server/content/index.js';

/**
 * `terrainAffinity` — данные героя: какие стихии ему «свои». Поле ничего не даёт в механике
 * (генератор стихии раздаёт без привилегий, `docs/terrain.md`), это подсказка игрокам, поэтому
 * опечатка в id стихии не падала бы — тест её ловит.
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
});
