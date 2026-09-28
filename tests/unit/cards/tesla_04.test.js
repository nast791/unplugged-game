import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/gameEngine.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = teslaCards.find(entry => entry.id === 'tesla_04');

const attackCard = (value = 5) => ({
  id: 'beta_01',
  instanceId: 'beta_01_1',
  title: 'Наскок',
  type: 'attack',
  value,
  bonus: 1,
  fighter: 'beta',
});

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'arcane' },
    { id: 2, neighbors: [1], terrain: 'arcane' },
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

const deckCard = index => ({
  id: `deck_${index}`,
  instanceId: `deck_${index}`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

/** Бета бьёт Теслу, Тесла защищается «Научным прорывом». */
const state = (coilStates = ['active', 'active'], teslaHp = 14, attackValue = 5) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Тесла',
        1,
        [unit('tesla', 1, teslaHp, { attackType: 'ranged', startHp: 14 })],
        [{ ...card, instanceId: 'tesla_04_1' }],
        [deckCard(0), deckCard(1), deckCard(2), deckCard(3)],
        coilsOf(coilStates),
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 2, 13, { attackType: 'ranged' })],
        [attackCard(attackValue)],
      ),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Бой доехал до окна свойства «после битвы»: базовая карта уже добрана, числа посчитаны. */
const battlePause = (start = state()) => {
  let battle = runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'beta_01_1',
    playerId: '1',
  });
  battle = runAction(battle, {
    type: 'PICK',
    kind: 'fighter',
    id: 'tesla',
    playerId: '1',
  });
  return runAction(battle, {
    type: 'PICK',
    kind: 'card',
    id: 'tesla_04_1',
    playerId: '0',
  });
};

const choose = (pause, optionId) =>
  runAction(pause, { type: 'PICK', kind: 'option', id: optionId, playerId: '0' });

const coilStates = state => player(state, '0').items.map(item => item.state);
const handSize = state => player(state, '0').hand.cards.length;
const teslaHp = state => player(state, '0').fighters[0].currentHp;

describe('карта tesla_04 «Научный прорыв»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual([
      'afterCombat',
      'afterCombat',
      'picked',
      'picked',
    ]);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.options.map(option => option.id)).toEqual(['study1', 'study2']);
  });

  it('базовая карта добирается сама: бой посчитан, карта в руке, свойство предложено', () => {
    const paused = battlePause(state(['active', 'active']));

    // 5 − 3 = 2 урона по Тесле
    expect(paused.lastCombat.combatDamage).toBe(2);
    expect(teslaHp(paused)).toBe(12);
    expect(handSize(paused)).toBe(1);
    expect(runUi(paused, '0').choices.map(choice => choice.optionId)).toEqual(['study1', 'study2']);
    expect(runUi(paused, '0').controls.ok.enabled).toBe(true);
  });

  it('одна катушка: ещё одна карта, лечение не применяется', () => {
    const after = choose(battlePause(state(['active', 'active'])), 'study1');

    expect(coilStates(after)).toEqual(['inactive', 'active']);
    expect(handSize(after)).toBe(2);
    expect(teslaHp(after)).toBe(12);
    expect(after.combat).toBeNull();
  });

  it('две катушки: ещё две карты и лечение на 1', () => {
    const after = choose(battlePause(state(['active', 'active'])), 'study2');

    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
    expect(handSize(after)).toBe(3);
    expect(teslaHp(after)).toBe(13);
  });

  it('одна активная катушка: доступен только первый вариант', () => {
    const paused = battlePause(state(['active', 'inactive']));

    // вторая ступень видна, но выбрать её нельзя: у варианта не сошлось условие доступности
    const choices = runUi(paused, '0').choices;
    expect(choices.map(choice => choice.optionId)).toEqual(['study1', 'study2']);
    expect(choices.map(choice => choice.disabled)).toEqual([false, true]);
    expect(() => choose(paused, 'study2')).toThrow(/недоступен/);

    const after = choose(paused, 'study1');
    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
    expect(handSize(after)).toBe(2);
  });

  it('ни одной активной катушки: свойство не предлагается, базовая карта добирается', () => {
    const after = battlePause(state(['inactive', 'inactive']));

    expect(after.targeting ?? null).toBeNull();
    expect(handSize(after)).toBe(1);
    expect(after.combat).toBeNull();
  });

  it('отказ: катушки не тратятся, базовая карта остаётся в руке', () => {
    const paused = battlePause(state(['active', 'active']));
    // в моменте два шага: базовый добор и окно ступеней — отказ помечает шаг окна
    const queue = paused.combat.effects;
    const window = queue.find(entry => entry.status === 'waiting');

    const declined = runAction(paused, { type: 'UI_OK', playerId: '0' });

    expect(coilStates(declined)).toEqual(['active', 'active']);
    expect(handSize(declined)).toBe(1);
    expect(window.status).toBe('declined');
    expect(declined.targeting).toBeNull();
    expect(declined.combat).toBeNull();
  });

  it('лечение не поднимает здоровье выше начального', () => {
    // атака 3 против защиты 3: урона нет, Тесла при полном здоровье — лечение ничего не добавляет
    const paused = battlePause(state(['active', 'active'], 14, 3));
    expect(teslaHp(paused)).toBe(14);

    const after = choose(paused, 'study2');

    expect(teslaHp(after)).toBe(14);
    expect(handSize(after)).toBe(3);
  });
});
