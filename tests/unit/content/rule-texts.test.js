import { describe, expect, it } from 'vitest';
import { CARD_MOMENT_PREFIXES } from '~/constants/cards.js';
import { buildCombatEffects } from '#shared/helpers/combat.js';
import { heroes } from '../../../server/content/index.js';
import common from '../../../server/content/common/cards.js';

/**
 * Подпись свойства в окне битвы — текст самого правила (`rule.text`), а не фраза, вырезанная из текста
 * карты по номеру шага: свойство и правило совпадают один к одному, поэтому текст один и верный.
 * Отсюда две проверки контента: текст есть у **каждого** правила карты и умения, и он печатается без
 * префикса момента («ПОСЛЕ БИТВЫ:» и т.п.) — момент окно показывает отдельной строкой.
 */
const decks = [
  ...Object.values(heroes).map(hero => ({ owner: String(hero.id), cards: hero.cards ?? [] })),
  { owner: 'common', cards: common },
];

const skills = Object.values(heroes)
  .map(hero => ({ owner: String(hero.id), skill: hero.skill }))
  .filter(entry => entry.skill != null);

const PREFIX = new RegExp(
  `^(${CARD_MOMENT_PREFIXES.flatMap(entry => entry.keys).join('|')})\\s*:`,
  'i',
);

const label = ({ owner, card, index, rule }) =>
  `${owner}/${card?.id ?? '—'}#${index} (${rule?.moment ?? '—'})`;

const rulesOfDeck = decks.flatMap(({ owner, cards }) =>
  cards.flatMap(card => (card?.rules ?? []).map((rule, index) => ({ owner, card, rule, index }))),
);

const rulesOfSkills = skills.flatMap(({ owner, skill }) =>
  (skill?.rules ?? []).map((rule, index) => ({ owner, card: skill, rule, index })),
);

const withoutText = rules => rules.filter(entry => String(entry.rule?.text ?? '').trim() === '');

describe('текст свойства у правил карт и умений', () => {
  it('у каждого правила карты есть непустой текст свойства', () => {
    expect(rulesOfDeck.length).toBeGreaterThan(0);
    expect(withoutText(rulesOfDeck).map(label)).toEqual([]);
  });

  it('у каждого правила умения есть непустой текст свойства', () => {
    expect(rulesOfSkills.length).toBeGreaterThan(0);
    expect(withoutText(rulesOfSkills).map(label)).toEqual([]);
  });

  it('текст свойства печатается без префикса момента', () => {
    const prefixed = [...rulesOfDeck, ...rulesOfSkills].filter(entry =>
      PREFIX.test(String(entry.rule?.text ?? '').trim()),
    );

    expect(prefixed.map(label)).toEqual([]);
  });

  it('очередь боя берёт текст шага из правила, а не из текста карты', () => {
    const attackCard = {
      id: 'probe_single',
      title: 'Одна ветка',
      rules: [{ moment: 'afterCombat', text: 'Доберите 1 карту.', then: [] }],
    };
    const defenseCard = { id: 'probe_plain', title: 'Без свойств', rules: [] };

    const effects = buildCombatEffects({
      attackCard,
      defenseCard,
      attackerPlayerId: 'attacker',
      defenderPlayerId: 'defender',
    });

    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      side: 'attacker',
      moment: 'afterCombat',
      text: 'Доберите 1 карту.',
    });
  });
});
