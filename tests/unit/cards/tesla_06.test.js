import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/gameEngine.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = teslaCards.find(entry => entry.id === 'tesla_06');

/**
 * Клетки 1, 5 и 6 — одна область Теслы, клетка 2 — другая: атакованный боец Беты стоит в чужой
 * области, помощник Беты и герой Гаммы — в области Теслы. Разряд бьёт только бойцов оппонента
 * в этой битве, поэтому Гамма (другой игрок) урона не получает.
 */
const map = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2, 5, 6], terrain: 'arcane' },
    { id: 2, neighbors: [1], terrain: 'lava' },
    { id: 5, neighbors: [1], terrain: 'arcane' },
    { id: 6, neighbors: [1], terrain: 'arcane' },
  ],
};

const unit = (id, cell, hp, extra = {}) => ({
  ...fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 3,
    attackRange: 1,
  }),
  ...extra,
});

const slot = (id, name, order, fighters, hand = [], deck = [], items = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: { visibility: [], cards: deck },
  hand: { visibility: [], cards: hand },
  discard: { visibility: [], cards: [] },
  fighters,
  items,
});

const coilsOf = (states = ['active', 'active']) =>
  states.map((state, index) => ({
    id: `coil_${index + 1}`,
    group: 'coil',
    name: 'Катушка Теслы',
    copies: 2,
    state,
  }));

/** Тесла бьёт Бету на клетке 2 (чужая область); рядом, в области Теслы, стоит помощник Беты. */
const state = (coilStates = ['active', 'active'], withAlly = true) =>
  createState({
    phase: PHASES.turn,
    map,
    players: [
      slot(
        '0',
        'Тесла',
        1,
        [unit('tesla', 1, 14, { attackType: 'ranged', startHp: 14 })],
        [{ ...card, instanceId: 'tesla_06_1' }],
        [],
        coilsOf(coilStates),
      ),
      slot('1', 'Бета', 2, [
        unit('beta', 2, 13, { attackType: 'ranged' }),
        ...(withAlly ? [unit('beta_ally', 5, 5, { type: 'assistant', group: 'beta' })] : []),
      ]),
      slot('2', 'Гамма', 3, [unit('gamma', 6, 12, { attackType: 'ranged' })]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const battlePause = start => {
  let battle = runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'tesla_06_1',
    playerId: '0',
  });
  battle = runAction(battle, {
    type: 'PICK',
    kind: 'fighter',
    id: 'beta',
    playerId: '0',
  });
  return runAction(battle, { type: 'UI_OK', playerId: '1' });
};

const choose = (pause, optionId) =>
  runAction(pause, { type: 'PICK', kind: 'option', id: optionId, playerId: '0' });

const coilStates = state => player(state, '0').items.map(item => item.state);
const hp = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId).currentHp;

describe('карта tesla_06 «Грозовой шквал»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['afterCombat', 'picked', 'picked']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.options.map(option => option.id)).toEqual(['storm1', 'storm2']);
  });

  it('разряд бьёт бойцов оппонента в области Теслы: чужого игрока в той же области не задевает', () => {
    const after = choose(battlePause(state(['active', 'active'])), 'storm1');

    // помощник Беты стоит в области Теслы и получает 1 урон разряда
    expect(hp(after, '1', 'beta_ally')).toBe(4);
    // атакованный боец Беты стоит в другой области: только урон карты (13 − 3 = 10)
    expect(hp(after, '1', 'beta')).toBe(10);
    // герой Гаммы тоже в области Теслы, но он не участник битвы: разряд его не задевает
    expect(hp(after, '2', 'gamma')).toBe(12);
    expect(coilStates(after)).toEqual(['inactive', 'active']);
  });

  it('две катушки: 2 урона каждому бойцу оппонента в области Теслы', () => {
    const after = choose(battlePause(state(['active', 'active'])), 'storm2');

    expect(hp(after, '1', 'beta_ally')).toBe(3);
    expect(hp(after, '1', 'beta')).toBe(10);
    expect(hp(after, '2', 'gamma')).toBe(12);
    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
  });

  it('одна активная катушка: доступен только первый вариант', () => {
    const paused = battlePause(state(['active', 'inactive']));

    // вторая ступень видна, но выбрать её нельзя: у варианта не сошлось условие доступности
    const choices = runUi(paused, '0').choices;
    expect(choices.map(choice => choice.optionId)).toEqual(['storm1', 'storm2']);
    expect(choices.map(choice => choice.disabled)).toEqual([false, true]);
    expect(() => choose(paused, 'storm2')).toThrow(/недоступен/);
  });

  it('у оппонента нет бойцов в области Теслы: разряжать не по кому — свойства нет', () => {
    const after = battlePause(state(['active', 'active'], false));

    expect(after.targeting ?? null).toBeNull();
    expect(coilStates(after)).toEqual(['active', 'active']);
    expect(hp(after, '1', 'beta')).toBe(10);
    // Гамма стоит в области Теслы, но он не оппонент в этой битве — свойства это не включает
    expect(hp(after, '2', 'gamma')).toBe(12);
    expect(after.combat).toBeNull();
  });

  it('отказ: катушки не тратятся, урона от разряда нет', () => {
    const paused = battlePause(state(['active', 'active']));
    const window = paused.combat.effects.find(entry => entry.status === 'waiting');

    const declined = runAction(paused, { type: 'UI_OK', playerId: '0' });

    expect(coilStates(declined)).toEqual(['active', 'active']);
    expect(hp(declined, '1', 'beta_ally')).toBe(5);
    expect(window.status).toBe('declined');
    expect(declined.combat).toBeNull();
  });
});
