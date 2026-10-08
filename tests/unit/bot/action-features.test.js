import { describe, expect, it } from 'vitest';
import { ACTION_FEATURES, actionFeatures } from '../../../bot/play/actionFeatures.js';
import { createState } from '../../fixtures/state.js';

/**
 * Признаки варианта хода. Здесь проверяется свойство, из-за которого появился блок 20..22 (§28): у
 * клеток одного решения признаки обязаны **различаться** — иначе модель слепа, все шаги для неё
 * одинаковы, и ход помощника выбирается произвольно (у Медузы таких решений больше всех: три гарпии).
 *
 * Карта фикстуры — линия 8—9—10: свой герой на 8, свой помощник на 9, чужой герой на 10.
 */
const cell = (state, id) =>
  actionFeatures(state, '0', { action: { type: 'PICK', kind: 'cell', id } });

describe('признаки клетки', () => {
  it('шаг к врагу, шаг рядом и шаг в пустоту различаются', () => {
    const state = createState();
    const onEnemy = cell(state, 10);
    const next = cell(state, 9);
    const own = cell(state, 8);

    expect(ACTION_FEATURES).toBeGreaterThan(19);
    expect(own[3]).toBe(1); // это клетка
    expect(onEnemy[20]).toBe(0); // враг стоит здесь
    expect(next[20]).toBeCloseTo(1 / 6);
    expect(own[20]).toBeCloseTo(2 / 6);
    // враг достаёт клетку своей дальностью (у фикстуры 1)
    expect(onEnemy[21]).toBe(1);
    expect(next[21]).toBe(1);
    expect(own[21]).toBe(0);
    // ближайший свой боец: на своей клетке он и стоит, дальше — помощник через шаг
    expect(own[22]).toBe(0);
    expect(onEnemy[22]).toBeCloseTo(1 / 6);

    const patterns = new Set([onEnemy, next, own].map(vector => JSON.stringify(vector.slice(20))));
    expect(patterns.size).toBe(3);
  });

  it('без живых врагов клетка читается как «далеко», а не «вплотную»', () => {
    const state = createState();
    for (const fighter of state.players[1].fighters) fighter.currentHp = 0;
    const own = cell(state, 8);

    expect(own[20]).toBe(1); // 6/6 — никого рядом, а не «враг на клетке»
    expect(own[21]).toBe(0);
  });

  it('у карты и колоды блок клетки пуст', () => {
    const state = createState();
    const card = actionFeatures(state, '0', { action: { type: 'PICK', kind: 'card', id: 'atk' } });
    const deck = actionFeatures(state, '0', { action: { type: 'PICK', kind: 'deck' } });

    for (const vector of [card, deck]) {
      expect(vector.slice(20)).toEqual([0, 0, 0]);
    }
  });
});
