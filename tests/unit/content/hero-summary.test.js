import { describe, expect, it } from 'vitest';
import { heroes } from '../../../server/content/index.js';
import { buildHeroSummary } from '../../../server/builders.js';

/**
 * Карточка героя для страницы `/heroes/{id}`: страница живёт контентом, поэтому проверяем не один пак,
 * а все — новый герой должен появляться на странице сам, без правок клиента.
 */
describe('buildHeroSummary', () => {
  it('на каждый пак отдаёт числа, бойцов, карты и размер колоды', () => {
    const ids = Object.keys(heroes);
    expect(ids.length).toBeGreaterThan(0);

    for (const id of ids) {
      const summary = buildHeroSummary(heroes[id]);
      expect(summary.id).toBe(id);
      expect(summary.name).toBeTruthy();
      expect(summary.fighters.some(fighter => fighter.type === 'hero')).toBe(true);
      expect(summary.cards.length).toBeGreaterThan(0);
      // колода героя — ровно 30 копий (AGENTS §6), страница показывает это число игроку
      expect(summary.deckSize).toBe(30);
      expect(summary.fighters.every(fighter => fighter.hp >= 0 && fighter.move >= 0)).toBe(true);
    }
  });

  it('правила карт наружу не уходят: странице нужны только тексты', () => {
    for (const pack of Object.values(heroes)) {
      const summary = buildHeroSummary(pack);
      expect(summary.cards.every(card => !('rules' in card) && !('effects' in card))).toBe(true);
    }
  });

  it('умение и стихии переносятся, если они есть в паке', () => {
    const anubis = buildHeroSummary(heroes.anubis);
    expect(anubis.skill?.title).toBeTruthy();
    expect(anubis.skill?.text).toBeTruthy();
    expect(anubis.terrainAffinity).toContain('desert');
  });

  it('неизвестный пак — null, а не пустая карточка', () => {
    expect(buildHeroSummary(undefined)).toBe(null);
    expect(buildHeroSummary(null)).toBe(null);
  });
});
