import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = teslaCards.find(entry => entry.id === 'tesla_08');

/** Клетка 1 — Тесла, 2 — Бета, 3 и 4 — свободные: есть куда толкать и куда идти. */
const map = {
  id: 'square',
  nodes: [
    { id: 1, neighbors: [2, 3], terrain: 'ice' },
    { id: 2, neighbors: [1, 4], terrain: 'ice' },
    { id: 3, neighbors: [1, 4], terrain: 'ice' },
    { id: 4, neighbors: [2, 3], terrain: 'ice' },
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

const handCard = (id, bonus = 1) => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type: 'defense',
  value: 2,
  bonus,
});

/** Тесла бьёт Бету «Энергетическим импульсом»; у Беты в руке три карты. */
const state = (
  coilStates = ['active', 'active'],
  { betaHand = ['first', 'second', 'third'], betaHp = 13 } = {},
) =>
  createState({
    phase: PHASES.turn,
    map,
    players: [
      slot(
        '0',
        'Тесла',
        1,
        [unit('tesla', 1, 14, { attackRange: 3, startHp: 14 })],
        [{ ...card, instanceId: 'tesla_08_1' }],
        [],
        coilsOf(coilStates),
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 2, betaHp, { attackRange: 3 })],
        betaHand.map(id => handCard(id)),
      ),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Бой доехал до толчка: бой посчитан, Тесла ждёт перемещения бойца Беты. */
const pushPause = start => {
  let battle = runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'tesla_08_1',
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

const step = (state, fighterId, cellId) =>
  runAction(state, {
    type: 'PICK',
    kind: 'cell',
    cellId,
    fighterId,
    playerId: '0',
  });

const finish = state => runAction(state, { type: 'UI_OK', playerId: '0' });

const choose = (state, optionId) =>
  runAction(state, {
    type: 'PICK',
    kind: 'option',
    id: optionId,
    playerId: '0',
  });

const cellOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId).currentPosition;
const coilStates = state => player(state, '0').items.map(item => item.state);
const handIds = state => player(state, '1').hand.cards.map(entry => entry.id);
const discardIds = state => player(state, '1').discard.cards.map(entry => entry.id);

describe('карта tesla_08 «Энергетический импульс»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual([
      'afterCombat',
      'afterCombat',
      'picked',
      'picked',
    ]);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.options.map(option => option.id)).toEqual(['push1', 'push2']);
  });

  it('сначала толчок: черновик перемещения открыт на бойца оппонента, бюджет 2', () => {
    const paused = pushPause(state());

    expect(paused.lastCombat.combatDamage).toBe(2);
    expect(paused.combat.stage).toBe('close');
    expect(paused.movement.playerId).toBe('0');
    expect(paused.movement.budget).toBe(2);
    expect(paused.movement.fighters).toEqual(['beta']);
    expect(paused.movement.optional).toBe(true);
    expect(cellOf(paused, '1', 'beta')).toBe(2);
  });

  it('толчок на 2 клетки, затем выбор катушек', () => {
    const pushed = step(pushPause(state()), 'beta', 4);
    expect(cellOf(pushed, '1', 'beta')).toBe(4);

    const paused = finish(pushed);

    // толчок отработал, следом стоит окно ступеней
    expect(paused.movement).toBeNull();
    expect(runUi(paused, '0').choices.map(choice => choice.optionId)).toEqual(['push1', 'push2']);
  });

  it('«до 2 клеток» включает 0: от толчка можно отказаться, выбор остаётся', () => {
    const paused = finish(pushPause(state()));

    expect(cellOf(paused, '1', 'beta')).toBe(2);
    expect(runUi(paused, '0').choices.map(choice => choice.optionId)).toEqual(['push1', 'push2']);
    expect(paused.combat.effects.map(entry => entry.status).slice(0, 1)).toEqual(['declined']);
  });

  it('одна катушка: Тесла идёт до 2 клеток', () => {
    let run = finish(step(pushPause(state()), 'beta', 4));
    const before = run.lastCombat.combatDamage;

    run = choose(run, 'push1');

    // ступень оплачена, Тесла ходит вторым черновиком
    expect(coilStates(run)).toEqual(['inactive', 'active']);
    expect(run.movement.playerId).toBe('0');
    expect(run.movement.fighters).toEqual(['tesla']);

    run = finish(step(run, 'tesla', 3));

    expect(cellOf(run, '0', 'tesla')).toBe(3);
    expect(run.combat).toBeNull();
    expect(run.lastCombat.combatDamage).toBe(before);
  });

  it('две катушки: Тесла идёт, и оппонент сбрасывает случайную карту', () => {
    let run = finish(step(pushPause(state()), 'beta', 4));

    run = choose(run, 'push2');

    // сброс автоматический: карту выбирает последовательность партии, игрок её не выбирает
    expect(coilStates(run)).toEqual(['inactive', 'inactive']);
    expect(handIds(run)).toHaveLength(2);
    expect(discardIds(run)).toHaveLength(1);
    expect(['first', 'second', 'third']).toContain(discardIds(run)[0]);
    expect(run.movement.fighters).toEqual(['tesla']);

    run = finish(step(run, 'tesla', 3));

    expect(cellOf(run, '0', 'tesla')).toBe(3);
    expect(run.combat).toBeNull();
  });

  it('сброс при пустой руке оппонента ничего не ломает', () => {
    let run = finish(step(pushPause(state(['active', 'active'], { betaHand: [] })), 'beta', 4));

    run = choose(run, 'push2');

    expect(handIds(run)).toEqual([]);
    expect(discardIds(run)).toEqual([]);
  });

  it('одна активная катушка: доступен только первый вариант', () => {
    const paused = finish(step(pushPause(state(['active', 'inactive'])), 'beta', 4));

    // вторая ступень видна, но выбрать её нельзя: у варианта не сошлось условие доступности
    const choices = runUi(paused, '0').choices;
    expect(choices.map(choice => choice.optionId)).toEqual(['push1', 'push2']);
    expect(choices.map(choice => choice.disabled)).toEqual([false, true]);
    expect(() => choose(paused, 'push2')).toThrow(/недоступен/);
  });

  it('ни одной катушки: толчок есть, выбора нет', () => {
    const paused = finish(step(pushPause(state(['inactive', 'inactive'])), 'beta', 4));

    expect(cellOf(paused, '1', 'beta')).toBe(4);
    expect(paused.targeting ?? null).toBeNull();
    expect(paused.combat).toBeNull();
  });

  it('боец оппонента погиб в битве: толкать некого, выбор катушек остаётся', () => {
    // Бета с 2 здоровья: атака 2 добивает её, боец уходит с поля
    const paused = pushPause(state(['active', 'active'], { betaHp: 2 }));

    expect(paused.movement).toBeNull();
    expect(player(paused, '1').fighters).toHaveLength(0);
    expect(runUi(paused, '0').choices.map(choice => choice.optionId)).toEqual(['push1', 'push2']);
  });
});
