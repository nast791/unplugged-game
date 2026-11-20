import { describe, expect, it } from 'vitest';
import { SET_MOVEMENT } from '#shared/actions/movement.js';
import { movementDestinations, movementRejection } from '#shared/helpers/turn.js';
import { createState, fighter } from '../../fixtures/state.js';

/**
 * Два поведения перемещения:
 * 1. Проход сквозь врагов (`throughEnemies`) — **пошаговое наступление** (m02680): подсвечена соседняя
 *    клетка, клетка врага тоже шаг, после каждого шага подсветка пересчитывается, а остановиться на
 *    чужой клетке нельзя.
 * 2. «Один из двух» (`oneOf`): шаг второго бойца возвращает первого на его исходную клетку.
 */
const lineMap = (size = 8) => ({
  id: 'line',
  name: 'Line',
  nodes: Array.from({ length: size }, (_, index) => {
    const id = index + 1;
    return {
      id,
      x: index,
      y: 0,
      terrain: 'ice',
      neighbors: [id - 1, id + 1].filter(neighbor => neighbor >= 1 && neighbor <= size),
    };
  }),
});

const duoState = () => {
  const state = createState({ map: lineMap(), _enteredHooks: { gameStart: true, turn: true } });
  state.players[0].fighters = [
    fighter({ id: 'hero', type: 'hero', currentPosition: 2, currentHp: 16, startHp: 16, move: 2 }),
    fighter({ id: 'pawn', type: 'assistant', currentPosition: 4, currentHp: 6, startHp: 6 }),
  ];
  state.players[1].fighters = [
    fighter({ id: 'rival', type: 'hero', currentPosition: 3, currentHp: 15, startHp: 15 }),
  ];
  return state;
};

const fighterOf = (state, playerId, fighterId) =>
  state.players
    .find(entry => String(entry.id) === playerId)
    .fighters.find(entry => String(entry.id) === fighterId);

const step = (state, fighterId, cellId) =>
  SET_MOVEMENT(state, { op: 'step', playerId: '0', fighterId, cellId });

describe('проход сквозь врагов: пошаговое наступление', () => {
  it('клетка врага — шаг, а не место: урон на проходе, дальше подсветка ведёт с неё', () => {
    const state = SET_MOVEMENT(duoState(), {
      op: 'open',
      playerId: '0',
      budget: 3,
      throughEnemies: true,
      damageOnPass: 2,
      fighters: ['hero'],
    });

    // соседние клетки: 1 свободна, 3 — клетка врага (можно пройти), своего помощника на 4 нет в списке
    expect(movementDestinations(state, '0', 'hero')).toEqual(['1', '3']);
    expect(movementRejection(state, '0', 'hero', 3)).toBeNull();
    expect(movementRejection(state, '0', 'hero', 5)).toMatch(/не соседняя/);

    step(state, 'hero', 3);

    // боец стоит на клетке врага: это промежуточный шаг прохода
    expect(fighterOf(state, '0', 'hero').currentPosition).toBe(3);
    expect(fighterOf(state, '1', 'rival').currentHp).toBe(13);
    // подсветка пересчитана от новой клетки: назад и вперёд — сквозь своего помощника тоже можно
    expect(movementDestinations(state, '0', 'hero')).toEqual(['2', '4']);
  });

  it('без прохода сквозь врагов занятая клетка остаётся недоступной', () => {
    const state = SET_MOVEMENT(duoState(), {
      op: 'open',
      playerId: '0',
      budget: 3,
      fighters: ['hero'],
    });

    expect(movementDestinations(state, '0', 'hero')).toEqual(['1']);
    expect(movementRejection(state, '0', 'hero', 3)).toMatch(/занята|вне радиуса/);
  });
});

const oneOfState = () => {
  const state = createState({ map: lineMap(), _enteredHooks: { gameStart: true, turn: true } });
  state.players[0].fighters = [
    fighter({ id: 'anubis', type: 'hero', currentPosition: 1, currentHp: 15, startHp: 15 }),
    fighter({ id: 'amat', type: 'assistant', currentPosition: 2, currentHp: 8, startHp: 8 }),
  ];
  state.players[1].fighters = [
    fighter({ id: 'rival', type: 'hero', currentPosition: 8, currentHp: 15, startHp: 15 }),
  ];
  return state;
};

describe('перемещение «один из двух»: oneOf', () => {
  const open = state =>
    SET_MOVEMENT(state, {
      op: 'open',
      playerId: '0',
      budget: 2,
      teleport: true,
      oneOf: true,
      fighters: ['anubis', 'amat'],
    });

  it('шаг второго бойца возвращает первого на исходную клетку', () => {
    const state = open(oneOfState());

    step(state, 'anubis', 3);
    expect(fighterOf(state, '0', 'anubis').currentPosition).toBe(3);

    step(state, 'amat', 4);
    expect(fighterOf(state, '0', 'anubis').currentPosition).toBe(1);
    expect(fighterOf(state, '0', 'amat').currentPosition).toBe(4);
    expect(state.movement.moves).toEqual([{ fighterId: 'amat', from: 2, to: 4 }]);
  });

  it('повторный шаг того же бойца ничего не откатывает', () => {
    const state = open(oneOfState());

    step(state, 'anubis', 3);
    step(state, 'anubis', 5);

    expect(fighterOf(state, '0', 'anubis').currentPosition).toBe(5);
    expect(fighterOf(state, '0', 'amat').currentPosition).toBe(2);
    expect(state.movement.moves).toHaveLength(2);
  });
});
