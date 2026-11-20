import { describe, expect, it } from 'vitest';
import commonCards from '../../../server/content/common/cards.js';
import { heroes } from '../../../server/content/index.js';

/**
 * Названия уникальных карт героя не повторяются ни внутри колоды, ни у других героев
 * (`.docs/hero-algorithm.md` §6). Общие карты пула в колоды больше не берутся (решение владельца,
 * m04728: «Обманный маневр» и «Залп» у Дороти стали её «Ловкостью рук» и «Дружным отпором»), но пул
 * остаётся библиотекой для будущих героев — его id по-прежнему вырезаны из «своих».
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

  it('ни одна колода не берёт карты общего пула', () => {
    // пул остаётся библиотекой (его карты должны быть описаны правилами), но колоды собираются своими
    expect(commonCards.length).toBeGreaterThan(0);

    const pooled = Object.values(heroes).flatMap(hero =>
      (hero.cards ?? [])
        .filter(card => commonIds.has(card.id))
        .map(card => `${hero.id}/${card.id}`),
    );
    expect(pooled).toEqual([]);
  });

  it('id своих карт — всегда id героя и две цифры: у помощников своих префиксов нет', () => {
    for (const hero of Object.values(heroes)) {
      for (const card of hero.cards ?? []) {
        if (commonIds.has(card.id)) continue;
        // `.docs/hero-algorithm.md` §7: `medusa_07`, `anubis_13`; `toto_01`, `amat_01`, `ash_03` — ошибка
        expect(card.id, `карта «${card.title}» героя ${hero.id}`).toMatch(
          new RegExp(`^${hero.id}_\\d{2}$`),
        );
      }
    }
  });
});
