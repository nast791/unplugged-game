import { describe, expect, it } from 'vitest';
import { CARD_MOMENT_PREFIXES, CARD_TEXT_OPTION_LABELS } from '../../../app/constants/cards.js';
import {
  cardPropertyText,
  cardTextBlocks,
  cardTextLines,
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

describe('свойство карты по номеру шага', () => {
  const text =
    'ПОСЛЕ БИТВЫ: Поменяйте местами бойца оппонента и Тото. Получите 1 дополнительное действие. ' +
    'Если обмен не состоялся, получите 2 дополнительных действия вместо 1.';

  it('шаг называет свою фразу своего момента', () => {
    expect(cardPropertyText(text, 'afterCombat', 0)).toBe(
      'Поменяйте местами бойца оппонента и Тото.',
    );
    expect(cardPropertyText(text, 'afterCombat', 1)).toBe('Получите 1 дополнительное действие.');
    expect(cardPropertyText(text, 'afterCombat', 2)).toBe(
      'Если обмен не состоялся, получите 2 дополнительных действия вместо 1.',
    );
  });

  it('фраз меньше, чем правил, — номер упирается в последнюю фразу', () => {
    expect(
      cardPropertyText(
        'ПОСЛЕ БИТВЫ: Получите 1 действие. Лечение не больше запаса.',
        'afterCombat',
        2,
      ),
    ).toBe('Лечение не больше запаса.');
  });

  it('чужой момент и текст без префиксов фразы не выдумывают', () => {
    expect(cardPropertyText(text, 'immediately', 0)).toBe(null);
    expect(cardPropertyText('', 'afterCombat', 0)).toBe(null);
    expect(cardPropertyText(null, 'afterCombat', 0)).toBe(null);
  });
});

/**
 * Опции свойства («Помилование», «Наказание» у Анубиса) — часть текста, а не выбор игрока: они стоят
 * своей строкой с ярлыком, но нажать их нельзя. Режет их рабочая функция `cardTextLines`/`cardTextBlocks`,
 * а рисует `CardText.vue`.
 */
describe('строки свойства: опции начинаются с новой строки', () => {
  const scales =
    'ПОСЛЕ БИТВЫ: Если вы победили, оппонент сбрасывает 1 случайную карту. ' +
    'Помилование. ПОСЛЕ БИТВЫ: Восстановите Амат 2 здоровья. ' +
    'Наказание. ВО ВРЕМЯ БИТВЫ: Значение этой карты +2.';

  it('ярлык опции открывает своё свойство следующей строкой', () => {
    const blocks = cardTextBlocks(scales);

    expect(blocks.map(block => block.lines.map(line => line.label))).toEqual([
      [null],
      ['Помилование'],
      ['Наказание'],
    ]);
    expect(blocks[0].lines[0].text).toBe(
      'ПОСЛЕ БИТВЫ: Если вы победили, оппонент сбрасывает 1 случайную карту.',
    );
    expect(blocks[1].lines[0].text).toBe('ПОСЛЕ БИТВЫ: Восстановите Амат 2 здоровья.');
    expect(blocks[1].lines[0].moment).toBe('afterCombat');
    expect(blocks[2].lines[0].moment).toBe('duringCombat');
  });

  it('ярлык с двоеточием остаётся строкой своего свойства', () => {
    const blocks = cardTextBlocks('Помилование: возьмите 1 карту. Наказание: Возьмите 1 карту.');

    expect(blocks).toHaveLength(1);
    expect(blocks[0].lines.map(line => line.label)).toEqual(['Помилование', 'Наказание']);
    expect(blocks[0].lines[0].text).toBe('возьмите 1 карту.');
    expect(cardTextLines('Помилование: возьмите 1 карту.').map(line => line.label)).toEqual([
      'Помилование',
    ]);
  });

  it('упоминание ярлыка посреди фразы строку не режет', () => {
    const blocks = cardTextBlocks('ВО ВРЕМЯ БИТВЫ: карта получает Помилование и Наказание сразу.');

    expect(blocks[0].lines).toEqual([
      {
        label: null,
        moment: 'duringCombat',
        text: 'ВО ВРЕМЯ БИТВЫ: карта получает Помилование и Наказание сразу.',
        key: '0-0',
      },
    ]);
  });

  it('карта без опций — одна строка на блок момента', () => {
    const blocks = cardTextBlocks('МГНОВЕННО: сбросьте карту. ПОСЛЕ БИТВЫ: доберите карту.');

    expect(blocks.map(block => block.moment)).toEqual(['immediately', 'afterCombat']);
    expect(blocks.map(block => block.lines.length)).toEqual([1, 1]);
    expect(blocks[0].lines[0]).toMatchObject({
      label: null,
      moment: 'immediately',
      text: 'МГНОВЕННО: сбросьте карту.',
    });
  });

  it('словарь ярлыков и пустой текст', () => {
    expect(CARD_TEXT_OPTION_LABELS).toEqual(['Помилование', 'Наказание']);
    expect(cardTextLines('')).toEqual([]);
    expect(cardTextBlocks(null)).toEqual([]);
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
