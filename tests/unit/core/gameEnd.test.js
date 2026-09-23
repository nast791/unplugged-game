import { describe, expect, it } from 'vitest';
import { runUi } from '#shared/core.js';
import gameEnd from '#shared/lifecycle/gameEnd.js';
import finished from '#shared/phases/finished.js';
import { createState, PHASES } from '../../fixtures/state.js';

const finishedState = () => {
  const state = createState({ phase: PHASES.gameEnd, actionsLeft: 0 });
  state.winner = '0';
  state.movement = { playerId: '0', origins: {}, bonus: 0 };
  state.combat = { stage: 'defense' };
  state.targeting = { playerId: '0', candidates: [] };
  state.players[0]._activePhase = 'choose';
  return state;
};

describe('lifecycle gameEnd', () => {
  it('enter нормализует финал: моменты, действия, активные фазы', () => {
    const entered = gameEnd.enter(finishedState());

    expect(entered.movement).toBeNull();
    expect(entered.combat).toBeNull();
    expect(entered.targeting).toBeNull();
    expect(entered.turn.actionsLeft).toBe(0);
    expect(entered.players[0]._activePhase).toBeNull();
    expect(entered.winner).toBe('0');
    expect(entered._enteredHooks.gameEnd).toBe(true);
  });

  it('enter идемпотентен, body терминальный, exit снимает флаг', () => {
    const entered = gameEnd.enter(finishedState());
    entered.targeting = { playerId: '0', candidates: [] };
    expect(gameEnd.enter(entered).targeting).not.toBeNull();

    expect(gameEnd.body(entered)).toBe(true);
    expect(gameEnd.exit(entered)._enteredHooks.gameEnd).toBe(false);
  });

  it('фаза finished активна для всех и отдаёт итоги', () => {
    const state = gameEnd.enter(finishedState());
    expect(finished.active(state, '0')).toBe(true);
    expect(finished.active(state, '1')).toBe(true);

    const ui = runUi(state, '1');
    expect(ui.phase).toBe('finished');
    expect(ui.hint).toBe('Партия завершена: победа — Alpha');
    expect(ui.controls.ok.visible).toBe(false);
    expect(ui.deck.clickable).toBe(false);
    expect(ui.results.winner).toBe('0');
    expect(ui.results.winnerName).toBe('Alpha');
    expect(ui.results.players.map(entry => entry.name)).toEqual([
      'Alpha',
      'Beta',
    ]);
    expect(ui.results.players[0].fighters).toEqual([
      { id: 'alpha', name: 'Alpha', type: 'hero', hp: 15, maxHp: null },
      { id: 'pawn', name: 'Pawn', type: 'assistant', hp: 4, maxHp: null },
    ]);
  });
});
