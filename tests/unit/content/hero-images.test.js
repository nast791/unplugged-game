import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { heroes } from '../../../server/content/index.js';

/**
 * Арт объявлен в паке, а лежит рядом с ним файлом: объявление с опечаткой маршрут отдаёт 404,
 * и герой молча остаётся без картинки (аватарка Анубиса не появлялась именно потому, что её не объявили).
 * Поэтому проверяем каждое объявленное имя на диске, а не только адрес.
 */
const ART_DIR = join(process.cwd(), 'server/content/heroes');

const declared = pack => [
  ...pack.heroes.map(fighter => fighter.image),
  ...(pack.assistants || []).map(fighter => fighter.image),
  ...Object.values(pack.images || {}),
];

describe('арт героев', () => {
  it('каждый объявленный файл лежит в папке images пака', () => {
    for (const [id, pack] of Object.entries(heroes)) {
      for (const file of declared(pack).filter(Boolean)) {
        expect(existsSync(join(ART_DIR, id, 'images', file)), `${id}: ${file}`).toBe(true);
      }
    }
  });

  it('имена объявленных файлов — картинки, которые умеет отдавать маршрут', () => {
    for (const [id, pack] of Object.entries(heroes)) {
      for (const file of declared(pack).filter(Boolean)) {
        expect(/\.(webp|png|jpe?g)$/.test(file), `${id}: ${file}`).toBe(true);
      }
    }
  });

  it('аватар героя и фишка рисуются одним артом: у Анубиса он объявлен', () => {
    const hero = heroes.anubis.heroes.find(fighter => fighter.type === 'hero');
    expect(hero.image).toBe('avatar-anubis.webp');
  });
});
