import { describe, expect, it } from 'vitest';
import { SET_HEALTH } from '#shared/actions/health.js';
import { isMoment } from '#shared/constants/moments.js';
import { runFact } from '#shared/facts/run.js';
import { runAction } from '#shared/publicApi.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_01');

/**
 * Линия 1—2—3—4—5: клетки 1—3 лёд, 4—5 лава.
 * Дороти на 2, Бета на 3 (соседняя клетка), Тото — на 1 (область Дороти) или на 5 (чужая область).
 */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3, 5], terrain: 'lava' },
    { id: 5, neighbors: [4], terrain: 'lava' },
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

/** Дороти и Тото игрока 0 против Беты игрока 1; `totoCell` — где стоит собака. */
const buildState = ({ totoCell = 1 } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [unit('dorothy', 2, 12), unit('toto', totoCell, 6, { type: 'assistant', group: 'toto' })],
        [{ ...card, instanceId: 'dorothy_01_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Тото убит: боец уходит с поля в `lost` игрока. */
const killToto = state => {
  SET_HEALTH(state, { fighterId: 'toto', delta: -6 });
  return state;
};

/** Дороти бьёт Бету «Тото отвлекает»: карта привязана к ней, защитник пасует. */
const battle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'dorothy_01_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта dorothy_01 «Тото отвлекает»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('duringCombat');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({ type: 'attack', value: 3, bonus: 1, fighter: 'dorothy' });
  });

  it('Дороти в области Тото — условия нет, атака 3', () => {
    const after = battle(buildState({ totoCell: 1 }));

    expect(after.lastCombat.attackValue).toBe(3);
    expect(after.lastCombat.combatDamage).toBe(3);
    expect(after.lastCombat.winner).toBe('attacker');
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(10);
  });

  it('Дороти вне области Тото — +2, атака 5', () => {
    const after = battle(buildState({ totoCell: 5 }));

    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(5);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(8);
  });

  it('Тото убит — факт пуст, условие выполняется само: +2', () => {
    const state = killToto(buildState({ totoCell: 1 }));

    // собака ушла с поля в `lost`, поэтому ориентир «область Тото» больше не находится
    expect(fighterOf(state, '0', 'toto')).toBeUndefined();
    expect(player(state, '0').lost.map(entry => entry.id)).toEqual(['toto']);

    const fact = runFact(
      state,
      'FIGHTERS',
      { fighterIds: ['dorothy'], areaOf: 'toto', max: 0 },
      { playerId: '0' },
    );
    expect(fact.ok).toBe(true);
    expect(fact.value).toEqual([]);

    const after = battle(state);
    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(5);
  });
});
