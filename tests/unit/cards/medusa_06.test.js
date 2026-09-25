import { describe, expect, it } from 'vitest';
import { SET_COMBAT } from '#shared/actions-new/combat.js';
import { advanceCombat } from '#shared/cards/run.js';
import { endGameIfFinished } from '#shared/helpers/turn.js';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/gameEngine.js';
import {
  movableFighterIds,
  movementDestinations,
} from '#shared/helpers/turn.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = medusaCards.find(entry => entry.id === 'medusa_06');

/** Линия 1—2—3—4—5—6, одна зона. */
const lineMap = {
  id: 'line',
  nodes: [1, 2, 3, 4, 5, 6].map(id => ({
    id,
    neighbors: [id - 1, id + 1].filter(neighbor => neighbor >= 1 && neighbor <= 6),
    areas: ['#blue'],
  })),
};

const zone = cards => ({ visibility: [], cards });

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

/**
 * Медуза (игрок 0) бьёт Бету (игрок 1) картой «Ускорение».
 * `role: 'attack'` — карта играется в атаку, `role: 'defense'` — в защиту (тогда Бета атакует).
 */
const buildState = (role = 'attack') =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [
          unit('medusa', 1, role === 'defense' ? 2 : 16, { attackType: 'ranged' }),
          unit('harpies_1', 5, 1, { type: 'assistant', group: 'harpies' }),
        ],
        [{ ...card, instanceId: 'medusa_06_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 6, 13, { attackType: 'ranged' })], [
        {
          id: 'beta_atk',
          instanceId: 'beta_atk_1',
          type: 'attack',
          value: role === 'defense' ? 5 : 2,
          bonus: 1,
          fighter: 'beta',
        },
      ]),
    ],
    turn: {
      index: 1,
      playerId: role === 'defense' ? '1' : '0',
      actedRound: [role === 'defense' ? '1' : '0'],
    },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Медуза играет «Ускорение» в атаку: карта без привязки, поэтому сначала выбирает бойца. */
const playAsAttack = () => {
  let battle = runAction(buildState('attack'), {
    type: 'PICK',
    kind: 'card',
    id: 'medusa_06_1',
    playerId: '0',
  });
  battle = runAction(battle, {
    type: 'PICK',
    kind: 'fighter',
    id: 'medusa',
    playerId: '0',
  });
  battle = runAction(battle, {
    type: 'PICK',
    kind: 'fighter',
    id: 'beta',
    playerId: '0',
  });
  return runAction(battle, { type: 'UI_OK', playerId: '1' });
};

const step = (state, fighterId, cellId) =>
  runAction(state, {
    type: 'PICK',
    kind: 'cell',
    id: cellId,
    fighterId,
    playerId: '0',
  });

const positionOf = (state, fighterId) =>
  player(state, '0').fighters.find(entry => entry.id === fighterId)?.currentPosition;

describe('карта medusa_06 «Ускорение»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
  });

  it('после боя двигается только свой боец из боя, до 3 клеток', () => {
    const paused = playAsAttack();

    expect(paused.combat.choice.effect).toBe('movement');
    expect(paused.movement.budget).toBe(3);
    // участвовала Медуза; Гарпия в бою не была, поэтому её двигать нельзя
    expect(paused.movement.fighters).toEqual(['medusa']);
    expect(movableFighterIds(paused, '0')).toEqual(['medusa']);
    expect(runUi(paused, '0').highlightedFighterIds).toEqual(['medusa']);
    expect(movementDestinations(paused, '0', 'harpies_1')).toEqual([]);

    // из клетки 1 Медуза достаёт 2, 3 и 4 — ровно три шага
    expect(movementDestinations(paused, '0', 'medusa')).toEqual(['2', '3', '4']);

    const moved = step(paused, 'medusa', '4');
    expect(positionOf(moved, 'medusa')).toBe('4');
  });

  it('ход можно передумать: из 2 обратно в 3 и на старт', () => {
    const paused = playAsAttack();
    const left = step(paused, 'medusa', '2');

    // радиус считается от исходной клетки, поэтому подсветка та же
    expect(movementDestinations(left, '0', 'medusa')).toEqual(['1', '3', '4']);

    const right = step(left, 'medusa', '3');
    expect(positionOf(right, 'medusa')).toBe('3');

    const back = step(right, 'medusa', '1');
    expect(positionOf(back, 'medusa')).toBe('1');
  });

  it('можно отказаться: эффект закрывается, бой доигрывается', () => {
    const paused = playAsAttack();
    const queue = paused.combat.effects;

    const finished = runAction(paused, { type: 'UI_OK', playerId: '0' });

    expect(finished.movement).toBeNull();
    expect(finished.combat).toBeNull();
    expect(positionOf(finished, 'medusa')).toBe(1);
    expect(queue[0].status).toBe('declined');
  });

  it('свой боец погиб в бою — двигать нечего, эффект сгорает без паузы', () => {
    // Бета бьёт Медузу (2 HP), она защищается «Ускорением»: 5 − 3 = 2 урона — герой уходит с поля
    let battle = runAction(buildState('defense'), {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });
    battle = runAction(battle, {
      type: 'PICK',
      kind: 'fighter',
      id: 'medusa',
      playerId: '1',
    });

    const revealed = SET_COMBAT(battle, {
      op: 'defense',
      playerId: '0',
      cardId: 'medusa_06_1',
    });
    const queue = revealed.combat.effects;
    // победу объявляет тот, кто доигрывает бой: фаза зовёт advanceCombat + endGameIfFinished
    const after = endGameIfFinished(advanceCombat(revealed));

    expect(queue.map(entry => entry.status)).toEqual(['skipped']);
    expect(after.combat).toBeNull();
    expect(after.movement).toBeNull();
    expect(player(after, '0').fighters.map(entry => entry.id)).toEqual([
      'harpies_1',
    ]);
    expect(after.hook).toBe(PHASES.gameEnd);
    expect(after.winner).toBe('1');
  });
});
