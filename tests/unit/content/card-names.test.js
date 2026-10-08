import { describe, expect, it } from 'vitest';
import commonCards from '../../../server/content/common/cards.js';
import { heroes } from '../../../server/content/index.js';

/**
 * Названия уникальных карт героя не повторяются ни внутри колоды, ни у других героев
 * (`docs/hero-algorithm.md` §6). Общие карты пула — исключение: они намеренно одинаковые
 * у всех, кто их берёт, поэтому из проверки вырезаны по id.
 */
const commonIds = new Set(commonCards.map(card => card.id));

const ownCards = Object.values(heroes).flatMap(hero =>
  (hero.cards ?? [])
    .filter(card => !commonIds.has(card.id))
    .map(card => ({ hero: hero.id, id: card.id, title: card.title })),
);

describe('названия карт героев', () => {
  it('у каждой своей карты есть непустое название', () => {
    expect(ownCards.length).toBeGreaterThan(0);

    for (const card of ownCards) {
      expect(typeof card.title, `${card.hero}/${card.id}`).toBe('string');
      expect(card.title.trim().length, `${card.hero}/${card.id}`).toBeGreaterThan(0);
    }
  });

  it('названия не повторяются ни в колоде героя, ни между героями', () => {
    const seen = new Map();
    const duplicates = [];

    for (const card of ownCards) {
      const title = card.title.trim();
      const where = `${card.hero}/${card.id}`;
      if (seen.has(title)) duplicates.push(`«${title}»: ${seen.get(title)} и ${where}`);
      else seen.set(title, where);
    }

    expect(duplicates).toEqual([]);
  });

  it('карты общего пула в проверку не входят, хотя герои их и берут', () => {
    // пул непустой, и его id вырезаны из «своих» карт
    expect(commonCards.length).toBeGreaterThan(0);
    expect(ownCards.filter(card => commonIds.has(card.id))).toEqual([]);

    // герои действительно добирают колоду пулом: у Дороти таких копий три вида
    const pooled = heroes.dorothy.cards.filter(card => commonIds.has(card.id));
    expect(pooled.map(card => card.id)).toEqual(['common_feint', 'common_volley', 'common_recall']);
  });

  it('id своих карт — всегда id героя и две цифры: у помощников своих префиксов нет', () => {
    for (const hero of Object.values(heroes)) {
      for (const card of hero.cards ?? []) {
        if (commonIds.has(card.id)) continue;
        // `docs/hero-algorithm.md` §7: `medusa_07`, `anubis_13`; `toto_01`, `amat_01`, `ash_03` — ошибка
        expect(card.id, `карта «${card.title}» героя ${hero.id}`).toMatch(
          new RegExp(`^${hero.id}_\\d{2}$`),
        );
      }
    }
  });
});
