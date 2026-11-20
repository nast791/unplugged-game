import { describe, expect, it } from 'vitest';
import { TOOLTIPS } from '../../../app/constants/tooltips.js';
import commonCards from '../../../server/content/common/cards.js';
import { heroes } from '../../../server/content/index.js';
import { HINTS } from '../../../shared/constants/hints.js';

/**
 * Слова в текстах для игрока (`.docs/decisions/` 0006 и 0008): добавка карты — «бонус», а не
 * «усиление»; сражение — «битва», а не «бой». «Боец» и «усиление перемещения» в коде остаются.
 */
const banned = [
  [/усилен|усилит|усиль/i, '«бонус», а не «усиление»'],
  [/(^|[^а-яё])бо(й|ю|я)([^а-яё]|$)/i, '«битва», а не «бой»'],
];

/** Текст подсказки-функции: контекст-заглушка, чтобы получить готовую строку. */
const hintText = fn => {
  try {
    const text = fn({ name: 'Герой', limit: 7, count: 3, cells: 2 });

    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
};

/** Разворачивает словарь подсказок или тултипов в список строк. */
const walk = (node, path, out) => {
  for (const [key, value] of Object.entries(node)) {
    const where = `${path}.${key}`;

    if (typeof value === 'string') out.push({ where, text: value });
    else if (typeof value === 'function') {
      const text = hintText(value);
      if (text) out.push({ where, text });
    } else if (value && typeof value === 'object') walk(value, where, out);
  }

  return out;
};

const playerTexts = [];

for (const hero of Object.values(heroes)) {
  for (const card of hero.cards ?? []) {
    if (card.text) playerTexts.push({ where: `${hero.id}/${card.id}`, text: card.text });
    // подпись свойства в окне битвы — тоже текст для игрока: его печатает правило (`rule.text`)
    for (const rule of card.rules ?? []) {
      if (rule.text)
        playerTexts.push({ where: `${hero.id}/${card.id} (свойство)`, text: rule.text });
    }
    for (const option of card.options ?? []) {
      if (option.text)
        playerTexts.push({ where: `${hero.id}/${card.id} (вариант)`, text: option.text });
    }
  }

  if (hero.skill?.text) playerTexts.push({ where: `${hero.id}/skill`, text: hero.skill.text });
  for (const rule of hero.skill?.rules ?? []) {
    if (rule.text) playerTexts.push({ where: `${hero.id}/skill (правило)`, text: rule.text });
  }
}

for (const card of commonCards) {
  if (card.text) playerTexts.push({ where: `common/${card.id}`, text: card.text });
  for (const rule of card.rules ?? []) {
    if (rule.text) playerTexts.push({ where: `common/${card.id} (свойство)`, text: rule.text });
  }
}

walk(HINTS, 'hints', playerTexts);
walk(TOOLTIPS, 'tooltips', playerTexts);

describe('слова в текстах для игрока', () => {
  it('тексты собраны: все паки, общий пул, подсказки, тултипы', () => {
    expect(playerTexts.length).toBeGreaterThan(100);
  });

  it('говорят «бонус», а не «усиление», и «битва», а не «бой»', () => {
    for (const { where, text } of playerTexts) {
      for (const [pattern, rule] of banned) {
        expect(text, `${where}: ${rule} → "${text}"`).not.toMatch(pattern);
      }
    }
  });
});
