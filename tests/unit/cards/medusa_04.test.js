import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/gameEngine.js';
import {
  movableFighterIds,
  movementDestinations,
  movementRejection,
} from '#shared/helpers/turn.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = medusaCards.find(entry => entry.id === 'medusa_04');

/** Линия 1—2—3—4—5—6—7—8, одна зона: удобно считать клетки хода. */
const lineMap = {
  id: 'line',
  nodes: [1, 2, 3, 4, 5, 6, 7, 8].map(id => ({
    id,
    neighbors: [id - 1, id + 1].filter(neighbor => neighbor >= 1 && neighbor <= 8),
    areas: ['#blue'],
  })),
};

const zone = cards => ({ visibility: [], cards });

const unit = (id, cell, hp, { type = 'hero', group = null, attackType = 'melee' } = {}) => ({
  ...fighter({
    id,
    name: id,
    type,
    currentPosition: cell,
    currentHp: hp,
    move: 3,
    attackRange: 1,
  }),
  group,
  attackType,
});

const cardOf = (id, type, value, binding) => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type,
  value,
  bonus: 1,
  fighter: binding,
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
 * Бета (дальний боец, игрок 1) атакует Медузу (игрок 0). У Медузы в руке «Зов стаи»,
 * на поле — Медуза (1), Гарпия за спиной врага (2), Гарпия в дальнем конце (8).
 */
const state = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [
          unit('medusa', 1, 16, { attackType: 'ranged' }),
          unit('harpies_1', 2, 1, { type: 'assistant', group: 'harpies' }),
          unit('harpies_2', 8, 1, { type: 'assistant', group: 'harpies' }),
        ],
        [{ ...card, instanceId: 'medusa_04_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 13, { attackType: 'ranged' })], [
        cardOf('beta_atk', 'attack', 3, 'beta'),
      ]),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Бета бьёт Медузу, Медуза защищается «Зовом стаи» — дальше эффект «после боя». */
const answerDefense = () => {
  let battle = runAction(state(), {
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
  return runAction(battle, {
    type: 'PICK',
    kind: 'card',
    id: 'medusa_04_1',
    playerId: '0',
  });
};

const step = (state, fighterId, cellId) =>
  runAction(state, {
    type: 'PICK',
    kind: 'cell',
    id: cellId,
    fighterId,
    playerId: '0',
  });

const positions = state =>
  Object.fromEntries(
    player(state, '0').fighters.map(entry => [entry.id, entry.currentPosition]),
  );

describe('карта medusa_04 «Зов стаи»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
  });

  it('после боя открывает перемещение Гарпий: бюджет 3, только Гарпии, необязательное', () => {
    const paused = answerDefense();

    expect(paused.combat.choice.effect).toBe('movement');
    expect(paused.combat.choice.playerId).toBe('0');
    expect(paused.combat.choice.optional).toBe(true);
    expect(paused.movement.budget).toBe(3);
    expect(paused.movement.fighters).toEqual(['harpies_1', 'harpies_2']);
    expect(paused.combat.choice.fighters).toEqual(['harpies_1', 'harpies_2']);
    expect(paused.combat.effects[0].status).toBe('waiting');

    // подсвечены только те, кого можно двигать, кнопка — про эффект
    expect(runUi(paused, '0').highlightedFighterIds).toEqual([
      'harpies_1',
      'harpies_2',
    ]);
    expect(runUi(paused, '0').controls.ok.label).toBe('Закончить эффект');
    expect(movableFighterIds(paused, '0')).toEqual(['harpies_1', 'harpies_2']);
  });

  it('Гарпия ходит до 3 клеток, дальше бюджет не пускает', () => {
    const paused = answerDefense();

    // Гарпия в конце линии: доступны 1, 2 и 3 клетки, четвёртая — уже нет
    expect(movementDestinations(paused, '0', 'harpies_2')).toEqual(['5', '6', '7']);
    expect(movementRejection(paused, '0', 'harpies_2', '4')).toMatch(
      /вне радиуса/,
    );

    const moved = step(paused, 'harpies_2', '6');

    expect(positions(moved).harpies_2).toBe('6');
    expect(moved.movement.moves).toEqual([
      { fighterId: 'harpies_2', from: 8, to: '6' },
    ]);
  });

  it('чужие бойцы путь блокируют: это перемещение, а не перенос', () => {
    const paused = answerDefense();

    // Гарпия 1 стоит за спиной Беты (клетка 3): единственная соседняя свободная клетка — 4,
    // но пройти к ней можно только через врага, поэтому ходов нет вовсе
    expect(movementDestinations(paused, '0', 'harpies_1')).toEqual([]);
    expect(movementRejection(paused, '0', 'harpies_1', '4')).toMatch(
      /нет доступных клеток/,
    );
  });

  it('двигать можно только бойцов из списка: Медузу — нет', () => {
    const paused = answerDefense();

    expect(movementDestinations(paused, '0', 'medusa')).toEqual([]);
    expect(movementRejection(paused, '0', 'medusa', '4')).toMatch(/из списка/);
    expect(() => step(paused, 'medusa', '4')).toThrow(/из списка/);
  });

  it('можно не двигать никого: эффект закрывается как отказ, бой доигрывается', () => {
    const paused = answerDefense();

    const finished = runAction(paused, { type: 'UI_OK', playerId: '0' });

    expect(finished.movement).toBeNull();
    expect(finished.combat).toBeNull();
    expect(finished.lastCombat.combatDamage).toBe(0);
    expect(positions(finished).harpies_2).toBe(8);
  });

  it('подвинули — эффект сработал, и бой закрывается сам', () => {
    const paused = answerDefense();
    const queue = paused.combat.effects;
    const moved = step(step(paused, 'harpies_2', '7'), 'harpies_2', '6');

    const finished = runAction(moved, { type: 'UI_OK', playerId: '0' });

    expect(finished.movement).toBeNull();
    expect(finished.combat).toBeNull();
    expect(positions(finished).harpies_2).toBe('6');
    expect(queue[0].status).toBe('applied');
  });

  it('без живых Гарпий двигать некого: эффект не срабатывает', () => {
    const dead = state();
    player(dead, '0').fighters = player(dead, '0').fighters.filter(
      entry => entry.type === 'hero',
    );

    let battle = runAction(dead, {
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

    // карта привязана к Гарпиям: без живых Гарпий её и не сыграть в защиту
    expect(() =>
      runAction(battle, {
        type: 'PICK',
        kind: 'card',
        id: 'medusa_04_1',
        playerId: '0',
      }),
    ).toThrow(/нет на поле/);
  });
});
