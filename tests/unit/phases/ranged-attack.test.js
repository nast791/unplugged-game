import { describe, expect, it } from 'vitest';
import { attackCandidates, attackTargets } from '#shared/helpers/combat.js';
import { cellTerrain, sharesArea } from '#shared/helpers/placement.js';
import { runAction } from '#shared/gameEngine.js';
import { createState, fighter, PHASES } from '../../fixtures/state.js';

/**
 * Карта из трёх стихий (область = стихия клетки):
 *   1(plain) — 2(plain) — 3(lava) — 4(plain)
 *   5(swamp) — граничит с 2 и 3
 */
const zoneMap = {
  id: 'terrain',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'arcane' },
    { id: 2, neighbors: [1, 3, 5], terrain: 'arcane' },
    { id: 3, neighbors: [2, 4, 5], terrain: 'lava' },
    { id: 4, neighbors: [3], terrain: 'arcane' },
    { id: 5, neighbors: [2, 3], terrain: 'swamp' },
  ],
};

const zone = cards => ({ visibility: [], cards });

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

const shooter = (id, cell, attackType) =>
  fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: 10,
    move: 2,
    attackRange: 1,
    attackType,
  });

const target = (id, cell) =>
  fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: 10,
    move: 2,
    attackRange: 1,
  });

const attackCard = () => ({
  id: 'atk',
  instanceId: 'atk_1',
  title: 'Atk',
  type: 'attack',
  value: 3,
  bonus: 1,
});

const boardState = (attacker, defender) =>
  createState({
    phase: PHASES.turn,
    map: zoneMap,
    players: [
      slot('0', 'Стрелок', 1, [attacker], [attackCard()]),
      slot('1', 'Цель', 2, [defender]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const targetIds = (state, fighterId) =>
  attackTargets(state, '0', fighterId).map(entry => entry.fighterId);

const candidateIds = state =>
  attackCandidates(state, '0', attackCard()).map(entry => entry.fighterId);

describe('стихии и дальний бой', () => {
  it('область — это стихия: общая область только у клеток одной стихии', () => {
    const state = boardState(shooter('medusa', 5, 'ranged'), target('beta', 4));
    expect(cellTerrain(state, 5)).toBe('swamp');
    expect(sharesArea(state, 2, 1)).toBe(true);
    expect(sharesArea(state, 2, 4)).toBe(true);
    expect(sharesArea(state, 5, 2)).toBe(false);
    expect(sharesArea(state, 5, 3)).toBe(false);
    expect(sharesArea(state, 2, 3)).toBe(false);
    expect(sharesArea(state, 1, 3)).toBe(false);
  });

  it('дальний боец бьёт цель в своей зоне на любом расстоянии', () => {
    const state = boardState(shooter('medusa', 1, 'ranged'), target('beta', 4));
    // 1 и 4 — разные клетки одной синей зоны, между ними три шага
    expect(targetIds(state, 'medusa')).toEqual(['beta']);
    expect(candidateIds(state)).toEqual(['medusa']);
  });

  it('ближний боец на том же расстоянии не достаёт', () => {
    const state = boardState(shooter('alpha', 1, 'melee'), target('beta', 4));
    expect(targetIds(state, 'alpha')).toEqual([]);
    expect(candidateIds(state)).toEqual([]);
  });

  it('дальний боец в чужой зоне цель не достаёт, если она не рядом', () => {
    const state = boardState(shooter('medusa', 1, 'ranged'), target('beta', 3));
    // 1 (#blue) и 3 (#red): общей зоны нет, расстояние 2 больше attackRange
    expect(targetIds(state, 'medusa')).toEqual([]);
  });

  it('дальний боец всё равно бьёт соседнюю цель из другой зоны', () => {
    const state = boardState(shooter('medusa', 2, 'ranged'), target('beta', 3));
    // соседняя клетка: ближний предел attackRange = 1 сохраняется
    expect(targetIds(state, 'medusa')).toEqual(['beta']);
  });

  it('цель в одной зоне доступна объявлением боя', () => {
    const state = boardState(shooter('medusa', 1, 'ranged'), target('beta', 4));

    const opened = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'atk_1',
      playerId: '0',
    });
    const aimed = runAction(opened, {
      type: 'PICK',
      kind: 'fighter',
      id: 'beta',
      playerId: '0',
    });

    expect(aimed.combat.stage).toBe('defense');
    expect(aimed.combat.attackerFighterId).toBe('medusa');
    expect(aimed.combat.targetFighterId).toBe('beta');
  });
});
