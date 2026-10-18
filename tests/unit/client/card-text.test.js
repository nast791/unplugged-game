import { describe, expect, it } from 'vitest';
import { CARD_MOMENT_PREFIXES } from '../../../app/constants/cards.js';
import {
  cardTextParts,
  momentOfPrefix,
  momentsOfStage,
} from '../../../app/composables/game/useGameHelpers.js';

/**
 * Подсветка части свойства в тексте карты: у правил в контенте своего текста нет (проверено по всем
 * пакам — ни `title`, ни `text`), а текст карты — одна строка с префиксами момента. Значит резать текст
 * можно только по ним, и делает это чистая функция `cardTextParts`: окно битвы подсвечивает ту часть,
 * которая играет сейчас, а `Card.vue` рисует части блоками.
 *
 * Тест стережёт две ловушки контента: два написания «после боя» (`common_volley`, `dorothy_08`) и карты,
 * у которых в одной строке описаны два момента (`snow-queen_02`).
 */
describe('части текста карты по префиксам момента', () => {
  it('текст без префиксов — одна часть без момента', () => {
    expect(cardTextParts('Нанесите 1 урон помощнику противника.')).toEqual([
      { moment: null, text: 'Нанесите 1 урон помощнику противника.' },
    ]);
    expect(cardTextParts('')).toEqual([]);
    expect(cardTextParts(null)).toEqual([]);
  });

  it('префикс момента открывает свою часть', () => {
    const parts = cardTextParts('ВО ВРЕМЯ БИТВЫ: значение карты +2.');

    expect(parts).toEqual([{ moment: 'duringCombat', text: 'ВО ВРЕМЯ БИТВЫ: значение карты +2.' }]);
  });

  it('два момента в одной строке режутся на две части', () => {
    const parts = cardTextParts('ВО ВРЕМЯ БИТВЫ: значение карты +2. ПОСЛЕ БИТВЫ: доберите карту.');

    expect(parts.map(part => part.moment)).toEqual(['duringCombat', 'afterCombat']);
    expect(parts[1].text).toBe('ПОСЛЕ БИТВЫ: доберите карту.');
  });

  it('«ПОСЛЕ БИТВЫ» — префикс момента после битвы', () => {
    expect(momentOfPrefix('ПОСЛЕ БИТВЫ')).toBe('afterCombat');
    expect(momentOfPrefix('ПОСЛЕ БОЯ')).toBeNull();

    const parts = cardTextParts('МГНОВЕННО: сбросьте карту. ПОСЛЕ БИТВЫ: доберите карту.');
    expect(parts.map(part => part.moment)).toEqual(['immediately', 'afterCombat']);
  });

  it('текст перед первым префиксом не теряется', () => {
    const parts = cardTextParts('Выберите одно свойство: МГНОВЕННО: значение карты +1.');

    expect(parts.map(part => part.moment)).toEqual([null, 'immediately']);
    expect(parts[0].text).toBe('Выберите одно свойство:');
  });

  it('незнакомое слово с двоеточием префиксом не считается', () => {
    const parts = cardTextParts('СЛОВО: значение карты +1.');

    expect(parts).toEqual([{ moment: null, text: 'СЛОВО: значение карты +1.' }]);
  });
});

describe('моменты стадии боя', () => {
  it('до расчёта чисел играют «мгновенно» и «во время битвы», после — «после битвы»', () => {
    expect(momentsOfStage('reveal')).toEqual(['immediately', 'duringCombat']);
    expect(momentsOfStage('close')).toEqual(['afterCombat']);
    expect(momentsOfStage('defense')).toEqual([]);
    expect(momentsOfStage(null)).toEqual([]);
  });

  it('у каждого префикса словаря есть момент', () => {
    for (const entry of CARD_MOMENT_PREFIXES) {
      expect(entry.moment).toBeTruthy();
      for (const key of entry.keys) expect(momentOfPrefix(key)).toBe(entry.moment);
    }
  });
});
