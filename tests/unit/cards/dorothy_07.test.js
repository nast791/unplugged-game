import { describe, expect, it } from 'vitest';
import { SET_HEALTH } from '#shared/actions/health.js';
import { isMoment } from '#shared/constants/moments.js';
import { runFact } from '#shared/facts/run.js';
import { runRules } from '#shared/rules/run.js';
import { runAction } from '#shared/publicApi.js';
import { movementDestinations } from '#shared/helpers/turn.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_07');

/**
 * Линия 1—2—3—4—5 и клетка 6 рядом с 2: Тото на 3, Бета на 4 (соседняя),
 * Дороти — на 6, чтобы не занимать клетки отхода собаки.
 */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3, 6], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3, 5], terrain: 'ice' },
    { id: 5, neighbors: [4], terrain: 'ice' },
    { id: 6, neighbors: [2], terrain: 'ice' },
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

/** Тото бьёт Бету «Взять след»; у Дороти два действия на ход. */
const buildState = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [unit('dorothy', 6, 12), unit('toto', 3, 6, { type: 'assistant', group: 'toto' })],
        [{ ...card, instanceId: 'dorothy_07_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 4, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Атака Тото и пас защитника: победа атакующего открывает свойства «после битвы». */
const battle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'dorothy_07_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

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

describe('карта dorothy_07 «Взять след»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('afterCombat');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({ type: 'hybrid', value: 2, bonus: 2, fighter: 'toto' });
  });

  it('после победы даёт действие и перемещение Тото до 2 клеток', () => {
    const state = buildState();
    const before = state.turn.actionsLeft;

    const after = battle(state);

    expect(after.lastCombat.winner).toBe('attacker');
    // карта стоит действие и отдаёт его обратно
    expect(after.turn.actionsLeft).toBe(before);
    expect(after.movement).toMatchObject({
      playerId: '0',
      budget: 2,
      optional: true,
      fighters: ['toto'],
    });
    // Бета на 4 закрывает проход, поэтому собака отходит на 1 или 2 — ровно два шага от 3
    expect(movementDestinations(after, '0', 'toto')).toEqual(['1', '2']);

    const moved = step(after, 'toto', '1');
    expect(fighterOf(moved, '0', 'toto').currentPosition).toBe('1');

    const finished = runAction(moved, { type: 'UI_OK', playerId: '0' });
    expect(finished.movement).toBeNull();
    expect(finished.combat).toBeNull();
    expect(fighterOf(finished, '0', 'toto').currentPosition).toBe('1');
  });

  it('перемещение необязательно: «до 2 клеток» включает 0', () => {
    const after = battle(buildState());

    const finished = runAction(after, { type: 'UI_OK', playerId: '0' });

    expect(finished.movement).toBeNull();
    expect(fighterOf(finished, '0', 'toto').currentPosition).toBe(3);
    expect(finished.turn.actionsLeft).toBe(2);
  });

  it('Тото убит — карту нельзя даже объявить: она привязана к нему', () => {
    const state = buildState();
    SET_HEALTH(state, { fighterId: 'toto', delta: -6 });

    expect(player(state, '0').lost.map(entry => entry.id)).toEqual(['toto']);
    expect(runFact(state, 'FIGHTERS', { group: 'toto', min: 1 }, { playerId: '0' })).toMatchObject({
      ok: false,
      value: [],
    });
    expect(() =>
      runAction(state, { type: 'PICK', kind: 'card', id: 'dorothy_07_1', playerId: '0' }),
    ).toThrow(/привязана к бойцу/);
  });

  it('Тото убит в бою — правило «после битвы» гаснет: ни действия, ни перемещения', () => {
    const state = buildState();
    SET_HEALTH(state, { fighterId: 'toto', delta: -6 });
    // бой игрок 0 выиграл, но собаки на поле уже нет: правило ждёт FIGHTERS { group: 'toto' }
    state.lastCombat = {
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackerFighterId: 'toto',
      targetFighterId: 'beta',
      attackValue: 2,
      defenseValue: 0,
      combatDamage: 2,
      winner: 'attacker',
      winnerPlayerId: '0',
    };
    const before = state.turn.actionsLeft;

    const after = runRules(state, card.rules, 'afterCombat', {
      playerId: '0',
      source: 'dorothy_07_1',
      card,
    });

    expect(after.turn.actionsLeft).toBe(before);
    expect(after.movement).toBeNull();
  });
});
