import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import { movableFighterIds, movementDestinations } from '#shared/helpers/turn.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_11');

/** Линия 1—2—3—4—5—6: Дороти на 1, Тото на 3, Бета на 6 (враг нужен только для партии). */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3, 5], terrain: 'ice' },
    { id: 5, neighbors: [4, 6], terrain: 'ice' },
    { id: 6, neighbors: [5], terrain: 'ice' },
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

const slot = (id, name, order, fighters, hand = [], lost = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone(hand),
  discard: zone([]),
  fighters,
  lost,
});

/** Дороти держит «Золотую шапку»; `totoDead` — собака уже в `lost`. */
const buildState = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [unit('dorothy', 1, 12), unit('toto', 3, 6, { type: 'assistant', group: 'toto' })],
        [{ ...card, instanceId: 'dorothy_11_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 6, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
  });

const play = state =>
  runAction(state, { type: 'PICK', kind: 'card', id: 'dorothy_11_1', playerId: '0' });

const step = (state, fighterId, cellId) =>
  runAction(state, {
    type: 'PICK',
    kind: 'cell',
    id: cellId,
    fighterId,
    playerId: '0',
  });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта dorothy_11 «Золотая шапка»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('effect');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    // «Золотая шапка» — единственная карта колоды с усилением 3 (`docs/hero-algorithm.md` §6)
    expect(card).toMatchObject({ type: 'effect', value: null, bonus: 3, fighter: 'dorothy' });
  });

  it('открывает перенос пары: бюджет 2 каждому, действие тратится один раз', () => {
    const played = play(buildState());

    expect(played.turn.actionsLeft).toBe(1);
    expect(played.movement).toMatchObject({
      playerId: '0',
      budget: 2,
      optional: true,
      fighters: ['dorothy', 'toto'],
    });
    expect(movableFighterIds(played, '0')).toEqual(['dorothy', 'toto']);
    // Дороти со своей клетки достаёт 2 и 3, но 3 занята Тото
    expect(movementDestinations(played, '0', 'dorothy')).toEqual(['2']);
    // Тото с 3 идёт до двух клеток: 2, 4 и 5 (1 занята Дороти)
    expect(movementDestinations(played, '0', 'toto')).toEqual(['2', '4', '5']);
  });

  it('оба бойца переставляются, эффект закрывается концом перемещения', () => {
    let run = play(buildState());
    run = step(run, 'dorothy', 2);
    run = step(run, 'toto', 5);

    expect(fighterOf(run, '0', 'dorothy').currentPosition).toBe(2);
    expect(fighterOf(run, '0', 'toto').currentPosition).toBe(5);

    const finished = runAction(run, { type: 'UI_OK', playerId: '0' });

    expect(finished.movement).toBeNull();
    expect(finished.effect).toBeNull();
    expect(fighterOf(finished, '0', 'dorothy').currentPosition).toBe(2);
    expect(fighterOf(finished, '0', 'toto').currentPosition).toBe(5);
    expect(player(finished, '0').discard.cards.map(entry => entry.id)).toEqual(['dorothy_11']);
  });

  it('Тото убит — шапка несёт одну Дороти', () => {
    const state = buildState();
    player(state, '0').fighters = player(state, '0').fighters.filter(entry => entry.id !== 'toto');
    player(state, '0').lost = [
      { ...unit('toto', null, 0, { type: 'assistant', group: 'toto' }), currentPosition: null },
    ];

    const played = play(state);

    expect(played.movement).toMatchObject({ fighters: ['dorothy'], budget: 2 });
    expect(movableFighterIds(played, '0')).toEqual(['dorothy']);
    expect(movementDestinations(played, '0', 'dorothy')).toEqual(['2', '3']);
  });
});
