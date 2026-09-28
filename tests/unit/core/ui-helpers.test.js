import { describe, expect, it } from 'vitest';
import { fighterClickIntent, fighterPickExpected } from '#shared/helpers/ui.js';

/**
 * Клик по бойцу уходит в движок только там, где движок его ждёт: объявление атаки и окно цели.
 * От этого правила зависит выбор атакующего — регрессия здесь останавливала бой
 * («Выберите бойца, который атакует этой картой», клик ничего не делает).
 */
describe('fighterPickExpected: где клик по бойцу уходит в движок', () => {
  it('фаза объявила, что ждёт клика по бойцу — да', () => {
    expect(fighterPickExpected({ phase: 'attack', pickFighters: true })).toBe(true);
    expect(fighterPickExpected({ phase: 'choose', pickFighters: true })).toBe(true);
  });

  it('подсветка бойцов без флага — нет: на стадии защиты цель подсвечена, но выбор сделан', () => {
    expect(
      fighterPickExpected({
        phase: 'attack',
        pickFighters: false,
        highlightedFighterIds: ['beta'],
      }),
    ).toBe(false);
  });

  it('перемещение и расстановка — нет: там клик только выбирает бойца', () => {
    expect(fighterPickExpected({ phase: 'movement', highlightedFighterIds: ['medusa'] })).toBe(
      false,
    );
    expect(fighterPickExpected({ phase: 'place', highlightedFighterIds: ['medusa'] })).toBe(false);
  });

  it('нет ui — нет', () => {
    expect(fighterPickExpected(null)).toBe(false);
    expect(fighterPickExpected({})).toBe(false);
  });
});

/**
 * Клик по бойцу: кандидат — движку, подсвеченный боец — выбор для шага, остальное — отказ.
 * Чужой подсвеченный боец выбирается наравне со своим: принудительное перемещение двигает врагов
 * (свойство «передвиньте вражеских бойцов»), и раньше такой клик отклонялся сообщением об ошибке.
 */
describe('fighterClickIntent: что значит клик по бойцу', () => {
  const movement = {
    phase: 'movement',
    pickFighters: false,
    highlightedFighterIds: ['beta'],
  };

  it('кандидат боя или окна цели — pick', () => {
    expect(
      fighterClickIntent(
        { phase: 'attack', pickFighters: true, highlightedFighterIds: ['beta'] },
        'beta',
        ['tesla'],
      ),
    ).toBe('pick');
    expect(
      fighterClickIntent(
        { phase: 'choose', pickFighters: true, highlightedFighterIds: ['beta'] },
        'beta',
        ['tesla'],
      ),
    ).toBe('pick');
  });

  it('подсвеченный чужой боец без флага выбора — select (принудительное перемещение)', () => {
    expect(fighterClickIntent(movement, 'beta', ['tesla'])).toBe('select');
    expect(fighterClickIntent(movement, 'beta', [])).toBe('select');
  });

  it('подсвеченный свой боец — select', () => {
    expect(
      fighterClickIntent({ phase: 'movement', highlightedFighterIds: ['tesla'] }, 'tesla', [
        'tesla',
      ]),
    ).toBe('select');
  });

  it('свой боец без подсветки — select, чужой без подсветки — refuse', () => {
    const ui = { phase: 'movement', highlightedFighterIds: [] };
    expect(fighterClickIntent(ui, 'tesla', ['tesla'])).toBe('select');
    expect(fighterClickIntent(ui, 'beta', ['tesla'])).toBe('refuse');
  });

  it('на стадии защиты подсвеченная цель — select, а не pick', () => {
    expect(
      fighterClickIntent(
        { phase: 'attack', pickFighters: false, highlightedFighterIds: ['beta'] },
        'beta',
        ['tesla'],
      ),
    ).toBe('select');
  });

  it('идентификаторы сравниваются как строки, пустой клик — refuse', () => {
    expect(
      fighterClickIntent({ phase: 'movement', highlightedFighterIds: [2] }, 2, ['tesla']),
    ).toBe('select');
    expect(fighterClickIntent(movement, null, ['tesla'])).toBe('refuse');
    expect(fighterClickIntent(null, 'beta', ['tesla'])).toBe('refuse');
  });
});
