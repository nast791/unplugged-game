import { describe, expect, it } from 'vitest';
import { runAction } from '#shared/publicApi.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const guard = dorothyCards.find(entry => entry.id === 'dorothy_04');
const pillar = ifritCards.find(entry => entry.id === 'ifrit_01');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'lava' },
    { id: 2, neighbors: [1, 3], terrain: 'lava' },
    { id: 3, neighbors: [2], terrain: 'lava' },
  ],
};

const zone = cards => ({ visibility: [], cards });

const hero = (id, cell, hp) => ({
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
});

const slot = (id, name, order, fightersList, cards = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone(cards),
  discard: zone([]),
  fighters: fightersList,
  lost: [],
});

/**
 * Ифрита бьёт «Столпом огня» (6) по Дороти на 2 здоровья. Дороти защищается «Сменой караула» (4):
 * боевого урона ровно 2 — она повержена. Её «после битвы» лечение на 2 (вариант «heal») не должно
 * поднимать уже убитого героя.
 */
const buildState = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot('0', 'Ифрита', 1, [hero('ifrit', 1, 14)], [{ ...pillar, instanceId: 'pillar_1' }]),
      slot('1', 'Дороти', 2, [hero('dorothy', 2, 2)], [{ ...guard, instanceId: 'guard_1' }]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Ифрита бьёт, Дороти защищается; дальше пауза «выберите свойство» решается за Дороти. */
const battle = () => {
  let state = buildState();
  state = runAction(state, { type: 'PICK', kind: 'card', id: 'pillar_1', playerId: '0' });
  state = runAction(state, { type: 'PICK', kind: 'fighter', id: 'dorothy', playerId: '0' });
  return runAction(state, { type: 'PICK', kind: 'card', id: 'guard_1', playerId: '1' });
};

const lostIds = state => (player(state, '1').lost ?? []).map(entry => entry.id);
const aliveIds = state => player(state, '1').fighters.map(entry => entry.id);

describe('смерть от боевого урона: «после битвы» не лечит', () => {
  it('2 урона добивают Дороти — она сразу повержена', () => {
    const state = battle();

    expect(state.lastCombat.combatDamage).toBe(2);
    expect(state.lastCombat.attackValue).toBe(6);
    expect(state.lastCombat.defenseValue).toBe(4);
    expect(aliveIds(state)).toEqual([]);
    expect(lostIds(state)).toEqual(['dorothy']);
    expect(player(state, '1').lost[0].currentHp).toBe(0);
  });

  it('лечение на 2 не возвращает поверженного героя на поле', () => {
    let state = battle();
    // пауза «выберите свойство»: Дороти выбирает лечение, но лечить уже некого
    state = runAction(state, { type: 'PICK', kind: 'option', id: 'heal', playerId: '1' });
    state = runAction(state, { type: 'UI_OK', playerId: '1' });

    const lost = player(state, '1').lost.find(entry => entry.id === 'dorothy');

    expect(lost?.currentHp).toBe(0);
    expect(lost?.currentPosition).toBeNull();
    expect(player(state, '1').fighters).toEqual([]);
    // очередь боя доиграна, ни один шаг не завис в паузе
    const effects = state.lastCombat?.effects ?? state.combat?.effects ?? [];
    expect(effects.every(entry => entry.status !== 'waiting')).toBe(true);
  });
});
