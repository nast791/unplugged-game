import { describe, expect, it } from 'vitest';
import { attackCandidates, attackTargets } from '#shared/helpers/combat.js';
import { cellTerrain, sharesArea } from '#shared/helpers/placement.js';
import { runAction } from '#shared/publicApi.js';
import { createState, fighter, PHASES } from '../../fixtures/state.js';

/**
 * Дальность боя задаёт только `attackRange` — признака `attackType` в игре нет,
 * и «своя стихия» дальности не даёт (решение владельца).
 *
 * Карта: 1(лёд) — 2(лёд) — 3(лава) — 4(лёд) — 6(лёд), плюс 5(вода) рядом с 2 и 3.
 * Расстояния от 1: до 4 — три шага, до 6 — четыре; 1, 2, 4 и 6 — одна стихия (лёд).
 */
const zoneMap = {
  id: 'terrain',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3, 5], terrain: 'ice' },
    { id: 3, neighbors: [2, 4, 5], terrain: 'lava' },
    { id: 4, neighbors: [3, 6], terrain: 'ice' },
    { id: 5, neighbors: [2, 3], terrain: 'water' },
    { id: 6, neighbors: [4], terrain: 'ice' },
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

const shooter = (id, cell, attackRange) =>
  fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: 10,
    move: 2,
    attackRange,
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

describe('дальность боя по attackRange', () => {
  it('область — это стихия: общая область только у клеток одной стихии', () => {
    const state = boardState(shooter('medusa', 5, 3), shooter('beta', 4, 1));

    expect(cellTerrain(state, 5)).toBe('water');
    expect(sharesArea(state, 2, 1)).toBe(true);
    expect(sharesArea(state, 2, 4)).toBe(true);
    expect(sharesArea(state, 2, 6)).toBe(true);
    // вода и лава — соседи льда, но не его область
    expect(sharesArea(state, 5, 2)).toBe(false);
    expect(sharesArea(state, 5, 3)).toBe(false);
    expect(sharesArea(state, 2, 3)).toBe(false);
  });

  it('дальность 3: цель в трёх клетках достаёт, хотя между ними стихии', () => {
    // 1 — лёд, 4 — лёд: три шага и общая область
    const state = boardState(shooter('medusa', 1, 3), shooter('beta', 4, 1));

    expect(targetIds(state, 'medusa')).toEqual(['beta']);
    expect(candidateIds(state)).toEqual(['medusa']);
  });

  it('дальность 3: цель в четырёх клетках не достаёт, хотя это та же стихия', () => {
    // 1 и 6 — обе клетки льда, но четыре шага: общая область дальности больше не даёт
    const state = boardState(shooter('medusa', 1, 3), shooter('beta', 6, 1));

    expect(sharesArea(state, 1, 6)).toBe(true);
    expect(targetIds(state, 'medusa')).toEqual([]);
    expect(candidateIds(state)).toEqual([]);
  });

  it('дальность 2: цель в трёх клетках уже не достаёт', () => {
    const state = boardState(shooter('medusa', 1, 2), shooter('beta', 4, 1));

    expect(targetIds(state, 'medusa')).toEqual([]);
  });

  it('дальность 1 — ближний бой: цель в трёх клетках не достаёт', () => {
    const state = boardState(shooter('alpha', 1, 1), shooter('beta', 4, 1));

    expect(targetIds(state, 'alpha')).toEqual([]);
    expect(candidateIds(state)).toEqual([]);
  });

  it('дальник бьёт соседнюю цель из чужой стихии: дальность считает клетки, а не область', () => {
    // 2 — лёд, 3 — лава: соседи, дальность 3 проходит
    const state = boardState(shooter('medusa', 2, 3), shooter('beta', 3, 1));

    expect(sharesArea(state, 2, 3)).toBe(false);
    expect(targetIds(state, 'medusa')).toEqual(['beta']);
  });

  it('цель в пределах дальности доступна объявлением боя', () => {
    const state = boardState(shooter('medusa', 1, 3), shooter('beta', 4, 1));

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
