import { describe, expect, it } from 'vitest';
import { heroes } from '../../../server/content/index.js';

/**
 * Теги карт — данные героя: пак объявляет, какие метки он использует (`tags` в `index.js`), а карты
 * лишь проставляют их (`card.tags`). Общего списка тегов в движке нет: факты читают метку как строку
 * (`CARDS { tag }`, `HAND { tag }`), а смысл ей даёт герой. Эти два теста ловят опечатку в метке —
 * иначе карта молча перестала бы быть осколком.
 */
describe('теги карт: их заводит пак героя', () => {
  it('карта не использует тег, которого герой не объявил', () => {
    for (const hero of Object.values(heroes)) {
      const declared = new Set(hero.tags ?? []);
      for (const card of hero.cards ?? []) {
        for (const tag of card.tags ?? []) {
          expect(declared.has(tag), `${hero.id}/${card.id}: тег «${tag}» не объявлен в паке`).toBe(
            true,
          );
        }
      }
    }
  });

  it('объявленный тег героя действительно кем-то используется', () => {
    for (const hero of Object.values(heroes)) {
      for (const tag of hero.tags ?? []) {
        const used = (hero.cards ?? []).some(card => (card.tags ?? []).includes(tag));
        expect(used, `${hero.id}: тег «${tag}» объявлен, но ни одна карта его не ставит`).toBe(
          true,
        );
      }
    }
  });
});
