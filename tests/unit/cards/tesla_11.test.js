import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = teslaCards.find(entry => entry.id === 'tesla_11');

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

const coilsOf = (states = ['inactive', 'inactive']) =>
  states.map((state, index) => ({
    id: `coil_${index + 1}`,
    group: 'coil',
    name: 'Катушка Теслы',
    copies: 2,
    state,
  }));

const state = (coilStates = ['inactive', 'inactive']) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Тесла',
        1,
        [unit('tesla', 1, 14, { attackRange: 3, startHp: 14 })],
        [{ ...card, instanceId: 'tesla_11_1' }],
        [],
        coilsOf(coilStates),
      ),
      slot('1', 'Бета', 2, [unit('beta', 2, 13, { attackRange: 3 })]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Разыграть эффектную карту: одно действие и карта из руки. */
const play = start =>
  runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'tesla_11_1',
    playerId: '0',
  });

const coilStates = state => player(state, '0').items.map(item => item.state);
const actions = state => state.turn.actionsLeft;

describe('карта tesla_11 «Максимальная мощность»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['effect']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
  });

  it('обе катушки заряжаются, действие возвращается, карта уходит в сброс', () => {
    const start = state(['inactive', 'inactive']);
    const before = actions(start);

    const after = play(start);

    expect(coilStates(after)).toEqual(['active', 'active']);
    // карта стоит действие, а свойство возвращает его обратно
    expect(actions(after)).toBe(before);
    expect(player(after, '0').hand.cards).toHaveLength(0);
    expect(player(after, '0').discard.cards.map(entry => entry.id)).toEqual(['tesla_11']);
    expect(after.effect ?? null).toBeNull();
  });

  it('заряженные катушки: свойство выполняется без ошибок', () => {
    const after = play(state(['active', 'active']));

    expect(coilStates(after)).toEqual(['active', 'active']);
    expect(actions(after)).toBe(2);
  });

  it('разряженная катушка заряжается и когда вторая уже активна', () => {
    const after = play(state(['active', 'inactive']));

    expect(coilStates(after)).toEqual(['active', 'active']);
  });
});
