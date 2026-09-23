import { describe, expect, it } from 'vitest';
import { runUi } from '#shared/core.js';
import { runAction, runLifecycle } from '#shared/gameEngine.js';
import { createState, PHASES, player } from '../fixtures/state.js';

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2] },
    { id: 2, neighbors: [1, 3] },
    { id: 3, neighbors: [2] },
  ],
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(fighter => fighter.id === fighterId);

/** alpha (attackRange 2, карта atk_0) на 1, beta на 3 с 1 HP. */
const battleState = () => {
  const state = createState({
    phase: PHASES.turn,
    map: lineMap,
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });
  fighterOf(state, '0', 'alpha').currentPosition = 1;
  fighterOf(state, '0', 'alpha').attackRange = 2;
  fighterOf(state, '0', 'pawn').currentPosition = null;
  fighterOf(state, '1', 'beta').currentPosition = 3;
  fighterOf(state, '1', 'beta').currentHp = 1;
  return state;
};

describe('scenario: конец партии', () => {
  it('смертельный удар завершает партию и нормализует финал', () => {
    let state = battleState();

    state = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'atk_0',
      playerId: '0',
    });
    state = runAction(state, {
      type: 'PICK',
      kind: 'fighter',
      id: 'beta',
      playerId: '0',
    });
    state = runAction(state, { type: 'UI_OK', playerId: '1' });

    expect(state.hook).toBe(PHASES.gameEnd);
    expect(state.winner).toBe('0');
    expect(state.combat).toBeNull();
    expect(state.movement).toBeNull();
    expect(state.turn.actionsLeft).toBe(0);
    expect(player(state, '1').fighters).toHaveLength(0);
    expect(state.players.every(entry => entry._activePhase == null)).toBe(true);

    const ui = runUi(state, '1');
    expect(ui.phase).toBe('finished');
    expect(ui.hint).toBe('Партия завершена: победа — Alpha');
    expect(ui.results.winnerName).toBe('Alpha');

    expect(() =>
      runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' }),
    ).toThrow(/партия завершена/);
  });

  it('turnStart уводит в gameEnd, когда ходить некому', () => {
    const state = createState({ phase: PHASES.turnEnd, actionsLeft: 0 });
    player(state, '1').fighters[0].currentHp = 0;

    const next = runLifecycle(state);

    expect(next.hook).toBe(PHASES.gameEnd);
    expect(next.winner).toBe('0');
    expect(next.turn.actionsLeft).toBe(0);
    expect(next.players.every(entry => entry._activePhase == null)).toBe(true);
  });
});
