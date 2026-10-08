import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = teslaCards.find(entry => entry.id === 'tesla_07');

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

const deckCard = index => ({
  id: `deck_${index}`,
  instanceId: `deck_${index}`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

/** Карта Беты: защита 5 и свойство «после битвы» — его и должна глушить отмена. */
const betaCard = () => ({
  id: 'beta_spy',
  instanceId: 'beta_spy_1',
  title: 'Подгляд',
  type: 'hybrid',
  value: 5,
  bonus: 1,
  fighter: 'beta',
  rules: [{ moment: 'afterCombat', then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }] }],
});

/** Бета бьёт Теслу картой 5, Тесла защищается «Фазовым резонансом». */
const betaAttacks = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Тесла',
        1,
        [unit('tesla', 1, 14, { attackRange: 3, startHp: 14 })],
        [{ ...card, instanceId: 'tesla_07_1' }],
        [],
        coilsOf(),
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 2, 13, { attackRange: 3 })],
        [
          {
            id: 'beta_atk',
            instanceId: 'beta_atk_1',
            title: 'Наскок',
            type: 'attack',
            value: 5,
            bonus: 1,
            fighter: 'beta',
          },
        ],
        [],
      ),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Тесла бьёт Бету «Фазовым резонансом»; Бета защищается картой 5. */
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
        [{ ...card, instanceId: 'tesla_07_1' }],
        [],
        coilsOf(coilStates),
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 2, 13, { attackRange: 3 })],
        [betaCard()],
        [deckCard(0), deckCard(1)],
      ),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Бой доехал до окна свойства «мгновенно»: карты вскрыты, числа ещё не посчитаны. */
const battlePause = (start = state()) => {
  let battle = runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'tesla_07_1',
    playerId: '0',
  });
  battle = runAction(battle, {
    type: 'PICK',
    kind: 'fighter',
    id: 'beta',
    playerId: '0',
  });
  return runAction(battle, {
    type: 'PICK',
    kind: 'card',
    id: 'beta_spy_1',
    playerId: '1',
  });
};

const choose = (pause, optionId) =>
  runAction(pause, { type: 'PICK', kind: 'option', id: optionId, playerId: '0' });

const coilStates = state => player(state, '0').items.map(item => item.state);
const handSize = (state, playerId) => player(state, playerId).hand.cards.length;
const betaHp = state => player(state, '1').fighters[0].currentHp;
/** Шаг очереди свойств из отчёта боя: после закрытия боя очередь живёт в `lastCombat`. */
const stepOf = (state, moment) =>
  (state.lastCombat?.effects ?? []).find(entry => entry.moment === moment);

describe('карта tesla_07 «Фазовый резонанс»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['immediately', 'picked', 'picked']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.options.map(option => option.id)).toEqual(['resonance1', 'resonance2']);
  });

  it('окно открывается сразу после вскрытия: числа ещё не посчитаны', () => {
    const paused = battlePause();

    expect(paused.combat.stage).toBe('reveal');
    expect(paused.lastCombat).toBeNull();
    expect(runUi(paused, '0').choices.map(choice => choice.optionId)).toEqual([
      'resonance1',
      'resonance2',
    ]);
    expect(runUi(paused, '0').controls.ok.enabled).toBe(true);
  });

  it('первая ступень: свойства карты Беты не действуют, её защита остаётся', () => {
    const paused = battlePause();

    const after = choose(paused, 'resonance1');

    expect(stepOf(after, 'afterCombat').status).toBe('cancelled');
    // карта Беты ушла в слот защиты, а добор от её свойства отменён
    expect(handSize(after, '1')).toBe(0);
    expect(coilStates(after)).toEqual(['inactive', 'active']);
    // защита 5 сильнее атаки 3 — урона нет, победил защитник
    expect(after.lastCombat.combatDamage).toBe(0);
    expect(betaHp(after)).toBe(13);
  });

  it('вторая ступень: свойства не действуют и значение карты Беты становится 0', () => {
    const paused = battlePause();

    const after = choose(paused, 'resonance2');

    expect(stepOf(after, 'afterCombat').status).toBe('cancelled');
    expect(after.lastCombat.attackValue).toBe(3);
    expect(after.lastCombat.defenseValue).toBe(0);
    expect(after.lastCombat.combatDamage).toBe(3);
    expect(betaHp(after)).toBe(10);
    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
  });

  it('отказ: карта Беты работает как обычно — защита 5 и добор', () => {
    const paused = battlePause();

    const declined = runAction(paused, { type: 'UI_OK', playerId: '0' });

    expect(stepOf(declined, 'afterCombat').status).toBe('applied');
    expect(handSize(declined, '1')).toBe(1);
    expect(declined.lastCombat.defenseValue).toBe(5);
    expect(coilStates(declined)).toEqual(['active', 'active']);
  });

  it('одна активная катушка: доступен только первый вариант', () => {
    const paused = battlePause(state(['active', 'inactive']));

    // вторая ступень видна, но выбрать её нельзя: у варианта не сошлось условие доступности
    const choices = runUi(paused, '0').choices;
    expect(choices.map(choice => choice.optionId)).toEqual(['resonance1', 'resonance2']);
    expect(choices.map(choice => choice.disabled)).toEqual([false, true]);
    expect(() => choose(paused, 'resonance2')).toThrow(/недоступен/);
  });

  it('когда бьют Теслу, «карта оппонента» — это атака: она тоже обнуляется', () => {
    let battle = runAction(betaAttacks(), {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });
    battle = runAction(battle, {
      type: 'PICK',
      kind: 'fighter',
      id: 'tesla',
      playerId: '1',
    });
    const paused = runAction(battle, {
      type: 'PICK',
      kind: 'card',
      id: 'tesla_07_1',
      playerId: '0',
    });

    const after = choose(paused, 'resonance2');

    expect(after.lastCombat.attackValue).toBe(0);
    expect(after.lastCombat.defenseValue).toBe(3);
    expect(after.lastCombat.combatDamage).toBe(0);
    expect(player(after, '0').fighters[0].currentHp).toBe(14);
  });
});
