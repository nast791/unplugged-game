import { describe, expect, it } from 'vitest';
import { advanceHooks } from '#shared/gameEngine.js';
import { runLifecycle } from '#shared/core.js';
import { ap, createState, fighter, PHASES, player } from '../../fixtures/state.js';

const enterTurnStart = state =>
  advanceHooks({ ...state, hook: PHASES.turnEnd }, () => state);

describe('core: turnStart', () => {
  it('первый turnStart: index=1, AP=2, bonus сброшен, первый игрок по order', () => {
    const state = createState({
      phase: PHASES.turnStart,
      turn: {
        index: 0,
        playerId: null,
        actionsLeft: 0,
        bonus: { movement: 1, attack: 2, defense: 0, actions: 1 },
        actedRound: [],
      },
    });
    const next = runLifecycle(state);
    expect(next.hook).toBe(PHASES.turn);
    expect(next.turn.index).toBe(1);
    expect(next.turn.playerId).toBe('0');
    expect(ap(next)).toBe(2);
    expect(next.turn.bonus).toEqual({
      movement: 0,
      attack: 0,
      defense: 0,
      actions: 0,
    });
    expect(next.turn.actedRound).toEqual(['0']);
    expect(next.round).toBe(1);
  });

  it('второй turnStart: следующий игрок, round++ после полного круга', () => {
    const state = createState({
      phase: PHASES.turnStart,
      turn: {
        index: 1,
        playerId: '0',
        actionsLeft: 0,
        actedRound: ['0'],
      },
    });
    const next = runLifecycle(state);
    expect(next.hook).toBe(PHASES.turn);
    expect(next.turn.playerId).toBe('1');
    expect(next.turn.index).toBe(2);
    expect(next.round).toBe(2);
    expect(next.turn.actedRound).toEqual(['1']);
  });

  it('advanceHooks: turnEnd → turnStart (core) → turn', () => {
    const state = createState({
      phase: PHASES.turnEnd,
      turn: { index: 1, playerId: '0', actedRound: ['0'] },
      _enteredHooks: { gameStart: true },
    });
    const next = enterTurnStart(state);
    expect(next.hook).toBe(PHASES.turn);
    expect(next.turn.playerId).toBe('1');
    expect(next.turn.index).toBe(2);
  });

  it('actedRound: мёртвый id и повтор не ускоряют round++', () => {
    const players = [
      {
        ...player(createState(), '0'),
        order: 1,
        fighters: [fighter({ id: 'a', type: 'hero', currentHp: 10 })],
      },
      {
        id: '1',
        name: 'Beta',
        order: 2,
        placementReady: true,
        deck: { visibility: [], cards: [] },
        hand: { visibility: [], cards: [] },
        discard: { visibility: [], cards: [] },
        fighters: [fighter({ id: 'b', type: 'hero', currentHp: 0 })],
      },
      {
        id: '2',
        name: 'Gamma',
        order: 3,
        placementReady: true,
        deck: { visibility: [], cards: [] },
        hand: { visibility: [], cards: [] },
        discard: { visibility: [], cards: [] },
        fighters: [fighter({ id: 'c', type: 'hero', currentHp: 10 })],
      },
    ];
    const state = createState({
      phase: PHASES.turnStart,
      turn: { index: 3, playerId: '2', actedRound: ['0', '1'], actionsLeft: 0 },
      players,
    });
    const next = runLifecycle(state);
    expect(next.round).toBe(1);
    expect(next.turn.playerId).toBe('0');
    expect(next.turn.actedRound).toEqual(['0']);
  });

  it('≤1 живой стороны → gameEnd', () => {
    const state = createState({
      phase: PHASES.turnStart,
      turn: { index: 0, playerId: null, actedRound: [] },
    });
    player(state, '1').fighters[0].currentHp = 0;
    const next = runLifecycle(state);
    expect(next.hook).toBe(PHASES.gameEnd);
    expect(next.winner).toBe('0');
    expect(ap(next)).toBe(0);
  });
});
