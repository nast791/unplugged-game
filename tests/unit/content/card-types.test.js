import { describe, expect, it } from 'vitest';
import { cardTypes } from '#shared/constants/deck.js';
import { heroes } from '../../../server/content/index.js';

/**
 * Правило типа карты (`docs/hero-algorithm.md` §7): тип выбирается по свойству, а не по привычке.
 * Гибрид играется и в атаку, и в защиту, поэтому его свойство обязано быть осмысленным в обе стороны;
 * одностороннее свойство делает карту атакой или защитой.
 *
 * Машинно проверяется только то, что названо в правилах явно:
 * - `COMBAT { role: 'attacker' | 'defender' }` — свойство живёт за эту сторону боя;
 * - `SET_COMBAT { op: 'replaceDefense' }` — шаг атакующего: в защиту правило падает
 *   (`anubis_14` был гибридом и объявлял замену чужой защиты — так его и поймали).
 * Остальное — глазами: прочитать свойство, поставив себя защитником.
 */
const knownTypes = cardTypes.map(type => type.name);

const rolesIn = conditions =>
  (conditions ?? [])
    .filter(condition => condition?.fact === 'COMBAT' && condition.params?.role)
    .map(condition => String(condition.params.role));

/** Явные признаки стороны в правилах карты: роли из условий и шаги, доступные одной стороне. */
const sidesOf = card => {
  const roles = new Set();
  let replaceDefense = false;

  for (const rule of card.rules ?? []) {
    for (const role of [...rolesIn(rule.when), ...(rule.any ?? []).flatMap(rolesIn)]) {
      roles.add(role);
    }
    for (const step of rule.then ?? []) {
      if (step.action === 'SET_COMBAT' && step.op === 'replaceDefense') replaceDefense = true;
    }
  }

  return { roles, replaceDefense };
};

const decks = Object.values(heroes).map(hero => ({
  id: hero.id,
  cards: hero.cards ?? [],
}));

const wrong = check => {
  const found = [];
  for (const deck of decks) {
    for (const card of deck.cards) {
      const reason = check(deck.id, card);
      if (reason) found.push(reason);
    }
  }
  return found;
};

describe('тип карты соответствует её свойству', () => {
  it('у каждой карты тип из списка', () => {
    const broken = wrong((deckId, card) =>
      knownTypes.includes(card.type) ? null : `${deckId}/${card.id}: тип "${card.type}"`,
    );

    expect(broken).toEqual([]);
  });

  it('замена защиты — шаг атакующего: карта обязана быть атакой', () => {
    const broken = wrong((deckId, card) => {
      const { replaceDefense } = sidesOf(card);
      if (!replaceDefense || card.type === 'attack') return null;
      return `${deckId}/${card.id}: «replaceDefense» у карты типа "${card.type}" — в защиту правило упадёт`;
    });

    expect(broken).toEqual([]);
  });

  it('роль в условии не спорит с типом карты', () => {
    const broken = wrong((deckId, card) => {
      const { roles } = sidesOf(card);
      if (roles.has('attacker') && card.type === 'defense') {
        return `${deckId}/${card.id}: свойство атакующего у карты защиты — в защиту оно не сработает`;
      }
      if (roles.has('defender') && card.type === 'attack') {
        return `${deckId}/${card.id}: свойство защитника у карты атаки — в атаку оно не сработает`;
      }
      return null;
    });

    expect(broken).toEqual([]);
  });
});
