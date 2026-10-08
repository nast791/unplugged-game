import { describe, expect, it } from 'vitest';
import { SET_FIGHTER_CELL } from '#shared/actions/fighter.js';
import { SWAP_FIGHTERS } from '#shared/actions/swap.js';
import { runFact } from '#shared/core.js';
import { createState, player } from '../../fixtures/state.js';

/**
 * Правило владельца: телепорт — не движение. Флаг `movedThisTurn` ставит только шаг по полю;
 * обмен местами и любая постановка без прохода флаг не трогают, поэтому переставленный Анубис
 * сохраняет право суда (`FIGHTERS { movedThisTurn: true, max: 0 }`).
 */
const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

const moved = (state, playerId, fighterId) =>
  Boolean(fighterOf(state, playerId, fighterId).movedThisTurn);

const fact = (state, playerId, params) => runFact(state, 'FIGHTERS', params, { playerId });

describe('телепорт не считается движением', () => {
  it('обычный шаг по полю ставит флаг «двигался»', () => {
    const state = createState();
    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 });

    expect(moved(state, '0', 'alpha')).toBe(true);
    expect(fact(state, '0', { fighterIds: ['alpha'], movedThisTurn: true, max: 0 }).ok).toBe(false);
  });

  it('постановка с teleport флаг не ставит', () => {
    const state = createState();
    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9, teleport: true });

    expect(moved(state, '0', 'alpha')).toBe(false);
    expect(fact(state, '0', { fighterIds: ['alpha'], movedThisTurn: true, max: 0 }).ok).toBe(true);
  });

  it('обмен местами — телепорт: оба бойца остаются «не двигавшимися»', () => {
    const state = createState();
    SWAP_FIGHTERS(state, { a: 'alpha', b: 'pawn' });

    expect(fighterOf(state, '0', 'alpha').currentPosition).toBe(9);
    expect(fighterOf(state, '0', 'pawn').currentPosition).toBe(8);
    expect(moved(state, '0', 'alpha')).toBe(false);
    expect(moved(state, '0', 'pawn')).toBe(false);
    expect(fact(state, '0', { side: 'self', movedThisTurn: true, max: 0 }).ok).toBe(true);
  });

  it('после настоящего шага обмен флаг не снимает', () => {
    const state = createState();
    SET_FIGHTER_CELL(state, { fighterId: 'pawn', cellId: 8, teleport: true });
    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 });

    expect(moved(state, '0', 'alpha')).toBe(true);

    SWAP_FIGHTERS(state, { a: 'alpha', b: 'pawn' });

    expect(moved(state, '0', 'alpha')).toBe(true);
    expect(moved(state, '0', 'pawn')).toBe(false);
  });

  it('начало хода снимает флаг у всех', () => {
    const state = createState();
    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 });

    // хук turnStart снимает флаг — здесь проверяем сам сброс, без прогона хука
    state.players[0].fighters = state.players[0].fighters.map(entry =>
      entry.movedThisTurn ? { ...entry, movedThisTurn: false } : entry,
    );

    expect(moved(state, '0', 'alpha')).toBe(false);
  });
});
