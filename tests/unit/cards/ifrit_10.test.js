import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_10');

/** Линия 1—2—3—4: Ифрит на 2, Бета на 3 вплотную, 4 — свободная клетка для отталкивания. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3], terrain: 'ice' },
  ],
};

/** Дальняя карта: Бета на 6, соседей у Ифрита нет. */
const farMap = {
  id: 'far',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1], terrain: 'ice' },
    { id: 6, neighbors: [7], terrain: 'ice' },
    { id: 7, neighbors: [6], terrain: 'ice' },
  ],
};

const zone = cards => ({ visibility: [], cards });

const unit = (id, cell, hp, extra = {}) => ({
  ...fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 2,
    attackRange: 1,
  }),
  startHp: hp,
  ...extra,
});

const slot = (id, name, order, fighters, hand = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone(hand),
  discard: zone([]),
  fighters,
});

const buildState = ({ map = lineMap, betaCell = 3, betaHp = 13 } = {}) =>
  createState({
    phase: PHASES.turn,
    map,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 2, 14, { attackRange: 3 })],
        [{ ...card, instanceId: 'ifrit_10_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', betaCell, betaHp)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const play = state =>
  runAction(state, { type: 'PICK', kind: 'card', id: 'ifrit_10_1', playerId: '0' });

const push = (state, cellId) =>
  runAction(state, { type: 'PICK', kind: 'cell', id: cellId, fighterId: 'beta', playerId: '0' });

const finish = state => runAction(state, { type: 'UI_OK', playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_10 «Ожог»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['effect', 'picked']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'effect',
      value: null,
      bonus: 3,
      quantity: 2,
      fighter: 'ifrit',
    });
    // цель — любой боец в шаге от Ифрита, своя клетка в радиус не входит
    expect(card.rules[0].when[0]).toMatchObject({
      fact: 'FIGHTERS',
      params: { withinOf: 'ifrit', within: 1 },
      var: 'targets',
    });
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_TARGETING',
      op: 'open',
      kind: 'fighters',
      candidates: '$targets',
      count: 1,
      required: true,
      auto: true,
    });
    expect(card.rules[1].then[0]).toMatchObject({
      action: 'SET_HEALTH',
      fighterIds: '$picked',
      delta: -2,
    });
    expect(card.rules[1].then[1]).toMatchObject({
      action: 'SET_MOVEMENT',
      op: 'open',
      fighters: '$picked',
      budget: 2,
      optional: true,
      source: 'ifrit_10',
    });
  });

  it('единственный сосед отмечен сам: 2 урона и окно отталкивания', () => {
    const state = play(buildState());

    // окна выбора нет — сосед один
    expect(state.targeting ?? null).toBeNull();
    expect(fighterOf(state, '1', 'beta').currentHp).toBe(11);
    // у окна перемещения источник — ключ сыгранной копии карты
    expect(state.movement).toMatchObject({
      playerId: '0',
      fighters: ['beta'],
      budget: 2,
      optional: true,
      source: 'ifrit_10_1',
    });
    // толкают чужого бойца: он подсвечен, клик по клетке двигает именно его
    expect(runUi(state, '0').highlightedFighterIds).toEqual(['beta']);
  });

  it('бойца отталкивают на выбранную клетку, эффект закрывается', () => {
    const pushed = push(play(buildState()), 4);

    expect(String(fighterOf(pushed, '1', 'beta').currentPosition)).toBe('4');
    // шаг сделан, но окно перемещения ещё открыто: его закрывает общая кнопка
    const after = finish(pushed);

    expect(after.movement ?? null).toBeNull();
    expect(after.effect ?? null).toBeNull();
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(11);
  });

  it('можно закончить без переноса: урон остаётся, боец стоит', () => {
    const after = finish(play(buildState()));

    expect(String(fighterOf(after, '1', 'beta').currentPosition)).toBe('3');
    expect(after.movement ?? null).toBeNull();
    expect(after.effect ?? null).toBeNull();
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(11);
  });

  it('соседей нет — карта не предлагается к розыгрышу', () => {
    const state = buildState({ map: farMap, betaCell: 6 });

    expect(runUi(state, '0').playableCardIds).not.toContain('ifrit_10_1');
    expect(runUi(state, '0').disabledCardIds).toContain('ifrit_10_1');
  });

  it('сосед погиб от урона — окна переноса нет, эффект закрыт', () => {
    const state = play(buildState({ betaHp: 2 }));

    expect(player(state, '1').fighters).toEqual([]);
    expect(player(state, '1').lost.map(entry => entry.id)).toEqual(['beta']);
    expect(state.movement ?? null).toBeNull();
    expect(state.effect ?? null).toBeNull();
  });
});
