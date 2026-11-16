import { describe, expect, it } from 'vitest';
import { runAction } from '#shared/publicApi.js';
import { discard, hand, player } from '../../fixtures/state.js';
import { createState, fighter, PHASES } from '../../fixtures/state.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import snowQueenCards from '../../../server/content/heroes/snow-queen/cards.js';

const barrier = snowQueenCards.find(entry => entry.id === 'snow-queen_04');
const shard = snowQueenCards.find(entry => entry.id === 'snow-queen_06');
const attack = ifritCards.find(entry => entry.id === 'ifrit_01');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3], terrain: 'ice' },
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

const slot = (id, name, order, fighters, cards = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone(cards),
  discard: zone([]),
  fighters,
  lost: [],
});

/**
 * Ифрит бьёт «Столбом огня» (6) по Снежной королеве, та защищается «Хрустальным барьером» (2).
 * В руке у неё лежит осколок — его можно сбросить, чтобы поднять защиту до 4.
 */
const buildState = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Снежная королева',
        1,
        [unit('snow-queen', 2, 16)],
        [
          { ...barrier, instanceId: 'barrier_1' },
          { ...shard, instanceId: 'shard_1' },
        ],
      ),
      slot('1', 'Ифрит', 2, [unit('ifrit', 3, 14)], [{ ...attack, instanceId: 'attack_1' }]),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'], actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Атака Ифрита и защита барьером: бой останавливается на выборе осколка. */
const defend = () => {
  let state = buildState();
  state = runAction(state, { type: 'PICK', kind: 'card', id: 'attack_1', playerId: '1' });
  state = runAction(state, { type: 'PICK', kind: 'fighter', id: 'snow-queen', playerId: '1' });
  return runAction(state, { type: 'PICK', kind: 'card', id: 'barrier_1', playerId: '0' });
};

const heroOf = state => player(state, '0').fighters.find(entry => entry.id === 'snow-queen');

describe('карта snow-queen_04 «Хрустальный барьер»', () => {
  it('сброс осколка поднимает защиту до 4: урон 2, а не 4', () => {
    const waiting = defend();

    // во время битвы окно выбора открыто: осколок ещё в руке, число защиты пока 2
    expect(waiting.combat?.choice?.effect).toBe('discard');
    expect(
      waiting.combat.choice.candidates.map(entry =>
        String(entry.cardId ?? entry.instanceId ?? entry.id),
      ),
    ).toEqual(['shard_1']);

    const next = runAction(waiting, {
      type: 'PICK',
      kind: 'card',
      id: 'shard_1',
      playerId: '0',
    });

    // правило «picked» карты доиграно: значение защиты 4, значит урон 6 − 4 = 2
    expect(next.lastCombat.defenseValue).toBe(4);
    expect(next.lastCombat.combatDamage).toBe(2);
    expect(heroOf(next).currentHp).toBe(14);
    expect(
      discard(player(next, '0'))
        .map(card => card.instanceId)
        .sort(),
    ).toEqual(['barrier_1', 'shard_1']);
    expect(hand(player(next, '0')).map(card => card.instanceId)).toEqual([]);
  });

  it('отказ от сброса оставляет защиту 2: урон 4', () => {
    const waiting = defend();

    const next = runAction(waiting, { type: 'UI_OK', playerId: '0' });

    expect(next.lastCombat.defenseValue).toBe(2);
    expect(next.lastCombat.combatDamage).toBe(4);
    expect(heroOf(next).currentHp).toBe(12);
    expect(hand(player(next, '0')).map(card => card.instanceId)).toEqual(['shard_1']);
  });
});
