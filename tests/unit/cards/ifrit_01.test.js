import { describe, expect, it } from 'vitest';
import { runAction } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_01');

/** Линия 1—2—3—4—5: весь лёд, чтобы стихия в бою не участвовала. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3, 5], terrain: 'ice' },
    { id: 5, neighbors: [4], terrain: 'ice' },
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

const slot = (id, name, order, fighters, hand = [], deck = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone(deck),
  hand: zone(hand),
  discard: zone([]),
  fighters,
});

/** Ифрит на 2 держит «Столб огня», Бета ждёт на 3. */
const buildState = ({ heroCell = 2, heroHp = 14 } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', heroCell, heroHp, { attackRange: 3 })],
        [{ ...card, instanceId: 'ifrit_01_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Ифрит бьёт Бету «Столбом огня»; защитник пасует. */
const battle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_01_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_01 «Столб огня»', () => {
  it('карта без свойств: правила пусты, момент проверять нечего', () => {
    expect(card.rules).toEqual([]);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'attack',
      value: 5,
      bonus: 1,
      quantity: 2,
      fighter: 'ifrit',
      text: '',
    });
  });

  it('атака 5 без условий: урон проходит по цели', () => {
    const after = battle(buildState());

    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.defenseValue).toBe(0);
    expect(after.lastCombat.combatDamage).toBe(5);
    expect(after.lastCombat.winner).toBe('attacker');
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(8);
  });

  it('свойств нет — стихия и духи на число не влияют', () => {
    // на лаве тех же правил нет: разница была бы видна у «Жара из-под земли»
    const state = buildState({ heroCell: 2 });
    state.map.nodes[1].terrain = 'lava';

    const after = battle(state);

    expect(after.lastCombat.attackValue).toBe(5);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(8);
  });
});
