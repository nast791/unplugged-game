import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = teslaCards.find(entry => entry.id === 'tesla_03');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1], terrain: 'ice' },
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

/** Тесла бьёт Бету картой «Фокусированный разряд»; защитник пасует. */
const state = (coilStates = ['active', 'active']) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Тесла',
        1,
        [unit('tesla', 1, 14, { attackRange: 3, startHp: 14 })],
        [{ ...card, instanceId: 'tesla_03_1' }],
        [],
        coilsOf(coilStates),
      ),
      slot('1', 'Бета', 2, [unit('beta', 2, 13, { attackRange: 3 })]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Бой доехал до окна свойства «во время битвы» (бой решён ещё не был). */
const battlePause = (start = state()) => {
  let battle = runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'tesla_03_1',
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
const betaHp = state => player(state, '1').fighters[0].currentHp;

describe('карта tesla_03 «Фокусированный разряд»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['duringCombat', 'picked', 'picked']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.options.map(option => option.id)).toEqual(['focus1', 'focus2']);
  });

  it('окно открывается до расчёта боя: числа ещё не посчитаны', () => {
    const paused = battlePause(state(['active', 'active']));

    expect(paused.combat.stage).toBe('reveal');
    expect(paused.lastCombat).toBeNull();
    expect(runUi(paused, '0').choices.map(choice => choice.optionId)).toEqual(['focus1', 'focus2']);
    // «Вы можете» — свойство необязательное: общая кнопка отказывается от него
    expect(runUi(paused, '0').controls.ok.enabled).toBe(true);
  });

  it('одна катушка: атака карты становится 5', () => {
    const after = choose(battlePause(state(['active', 'active'])), 'focus1');

    expect(coilStates(after)).toEqual(['inactive', 'active']);
    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.defenseValue).toBe(0);
    expect(betaHp(after)).toBe(8);
    expect(after.combat).toBeNull();
  });

  it('две катушки: атака карты становится 7', () => {
    const after = choose(battlePause(state(['active', 'active'])), 'focus2');

    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
    expect(after.lastCombat.attackValue).toBe(7);
    expect(betaHp(after)).toBe(6);
  });

  it('одна активная катушка: доступен только первый вариант', () => {
    const paused = battlePause(state(['active', 'inactive']));

    // вторая ступень видна, но выбрать её нельзя: у варианта не сошлось условие доступности
    const choices = runUi(paused, '0').choices;
    expect(choices.map(choice => choice.optionId)).toEqual(['focus1', 'focus2']);
    expect(choices.map(choice => choice.disabled)).toEqual([false, true]);
    expect(() => choose(paused, 'focus2')).toThrow(/недоступен/);

    const after = choose(paused, 'focus1');
    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
    expect(after.lastCombat.attackValue).toBe(5);
  });

  it('ни одной активной катушки: свойство не предлагается, бой идёт по числу карты', () => {
    const after = battlePause(state(['inactive', 'inactive']));

    expect(after.targeting ?? null).toBeNull();
    expect(after.lastCombat.attackValue).toBe(3);
    expect(betaHp(after)).toBe(10);
  });

  it('отказ: катушки не тратятся, атака остаётся числом карты', () => {
    const paused = battlePause(state(['active', 'active']));

    const declined = runAction(paused, { type: 'UI_OK', playerId: '0' });

    expect(coilStates(declined)).toEqual(['active', 'active']);
    expect(declined.lastCombat.effects[0].status).toBe('declined');
    expect(declined.lastCombat.attackValue).toBe(3);
    expect(betaHp(declined)).toBe(10);
  });
});
