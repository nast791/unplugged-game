import { describe, expect, it } from 'vitest';
import medusa from '../../../server/content/heroes/medusa/index.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import tesla from '../../../server/content/heroes/tesla/index.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';

/**
 * Формулировки из оригинальной локализации Unmatched: свои карты мы пишем так, чтобы смысл
 * совпадал, а выражения были наши. Список — то, чего в наших текстах быть не должно.
 */
const originalPhrases = [
  'ПОСЛЕ БОЯ',
  'НЕМЕДЛЕННО',
  'ВО ВРЕМЯ БОЯ',
  'Если вы победили в бою',
  'вместо этого',
  'которого вы атаковали',
  'Отмените все эффекты',
  'поверженную Гарпию',
  'в зоне Медузы',
  'ячеек',
  'Переместите',
  'Возьмите',
  'УСИЛИТЬ',
  'в начале вашего хода',
  'ПЕРЕНАПРЯЖЕНИЕ',
  'Начните игру с',
  'Зарядите',
  'Разрядите',
  'заряженной катушкой',
  'смежных с Теслой',
  'переместите их на расстояние',
  'восстановить Тесле',
  'Выберите 1 эффект',
];

/** Названия карт оригинала — наши заголовки должны отличаться. */
const originalTitles = [
  'ПЕРЕДЫШКА',
  'УЛОВКА',
  'МЕТКИЙ ВЫСТРЕЛ',
  'РЫВОК',
  'КРЫЛАТОЕ БУЙСТВО',
  'МЕРТВАЯ ХВАТКА',
  'ГОНЧИЕ МОГУЧЕГО ЗЕВСА',
  'МИМОЛЁТНЫЙ ВЗГЛЯД',
  'ВТОРОЙ ВЫСТРЕЛ',
  'ШИПЕТЬ И ИЗВИВАТЬСЯ',
  'УБИЙСТВЕННЫЙ ВЗОР',
  'ПЕРЕМЕННЫЙ ТОК',
];

/** Варианты свойств карты — тоже текст для игрока (card.options[].text). */
const optionTexts = card => (card.options ?? []).map(option => option.text);

/** Все тексты, которые видит игрок: тексты карт, варианты свойств и способности героев. */
const playerTexts = [
  ...medusaCards.flatMap(card => [card.text, ...optionTexts(card)]),
  ...teslaCards.flatMap(card => [card.text, ...optionTexts(card)]),
  medusa.skill.text,
  tesla.skill.text,
];

const allCards = [...medusaCards, ...teslaCards];

describe('тексты карт: свои формулировки', () => {
  it('нет дословных фраз оригинала — ни в текстах, ни в вариантах свойств', () => {
    for (const text of playerTexts) {
      for (const phrase of originalPhrases) {
        expect(text.toUpperCase(), `"${text}" → "${phrase}"`).not.toContain(phrase.toUpperCase());
      }
    }
  });

  it('названия карт не совпадают с названиями оригинала', () => {
    const ours = allCards.map(card => card.title.toUpperCase());
    for (const title of originalTitles) {
      expect(ours, title).not.toContain(title);
    }
  });

  it('тексты короткие и без технического жаргона движка', () => {
    for (const text of playerTexts) {
      expect(text).not.toMatch(/rules|SET_|bonus|moment/);
    }

    // черновики немигрированных карт пока длиннее: их тексты перепишутся вместе с правилами
    const migrated = allCards.filter(card => (card.rules ?? []).length > 0);
    for (const card of migrated) {
      for (const text of [card.text, ...optionTexts(card)]) {
        expect(text.length, text).toBeLessThan(200);
      }
    }
  });

  it('в текстах используется «битва», а не «бой»', () => {
    // «боец» и его формы — можно, а слово «бой» в значении сражения — нет
    const battleWord = /(^|[^а-яё])бо(й|ю|я)([^а-яё]|$)/i;
    for (const text of playerTexts) {
      expect(text, text).not.toMatch(battleWord);
    }
  });

  it('тексты единообразны: метки фаз, заглавная буква, точки вместо точек с запятой', () => {
    const labels = [
      'НАЧАЛО ИГРЫ: ',
      'НАЧАЛО ХОДА: ',
      'КОНЕЦ ХОДА: ',
      'ПОСЛЕ БИТВЫ: ',
      'ВО ВРЕМЯ БИТВЫ: ',
      'МГНОВЕННО: ',
    ];

    for (const text of playerTexts) {
      // меток в тексте может быть несколько: у текста бывает не одна фаза
      for (const label of labels) {
        let index = text.indexOf(label);
        while (index >= 0) {
          const after = text[index + label.length] ?? '';
          expect(after, `${text} → ${label}`).toBe(after.toUpperCase());
          index = text.indexOf(label, index + label.length);
        }
      }

      // если фраза начинается с метки, она должна быть из списка
      const firstWord = text.split(' ')[0];
      if (firstWord.endsWith(':')) {
        expect(labels, text).toContain(`${firstWord} `);
      }

      expect(text[0], text).toBe(text[0].toUpperCase());
      expect(text, text).not.toContain(';');
      expect(text.trim(), text).toBe(text);
    }
  });

  it('варианты свойств описаны один раз — в card.options, правила ссылаются на их id', () => {
    // действия правила лежат либо в rule.then, либо в ветке rule.any (у ветки своё действие)
    const stepsOf = rule => [
      ...(rule.then ?? []),
      ...(rule.any ?? []).flatMap(branch => (Array.isArray(branch) ? [] : (branch.then ?? []))),
    ];

    for (const card of allCards) {
      if (!card.options) continue;

      const ids = card.options.map(option => option.id);
      expect(new Set(ids).size, card.id).toBe(ids.length);

      const used = new Set();
      for (const rule of card.rules ?? []) {
        for (const step of stepsOf(rule)) {
          if (step.kind !== 'options') continue;
          expect(step.candidates?.length, card.id).toBeGreaterThan(0);
          // окно может предлагать часть вариантов (по состоянию), но только свои
          for (const candidate of step.candidates ?? []) {
            expect(ids, `${card.id}: ${candidate}`).toContain(candidate);
            used.add(candidate);
          }
        }
      }

      // вариантов без правил не бывает: каждый описан и кем-то предлагается
      expect([...used].sort(), card.id).toEqual([...ids].sort());
    }
  });
});
