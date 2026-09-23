import { describe, expect, it } from 'vitest';
import { rules } from '#shared/constants/rules.js';
import turn from '#shared/lifecycle/turn.js';
import turnEnd from '#shared/lifecycle/turnEnd.js';
import turnStart from '#shared/lifecycle/turnStart.js';
import { ap, createState, player, PHASES } from '../../fixtures/state.js';

describe('lifecycle turnEnd', () => {
  it('enter помечает вход, снимает моменты и не повторяется', () => {
    const state = createState({ phase: PHASES.turn, actionsLeft: 0 });
    state.movement = { playerId: '0', origins: {}, bonus: 0 };
    state.combat = { stage: 'defense' };
    state.targeting = { playerId: '0', candidates: [] };

    const entered = turnEnd.enter(state);
    expect(entered.movement).toBeNull();
    expect(entered.combat).toBeNull();
    expect(entered.targeting).toBeNull();
    expect(entered._enteredHooks.turnEnd).toBe(true);

    entered.movement = { playerId: '0', origins: {}, bonus: 0 };
    expect(turnEnd.enter(entered).movement).not.toBeNull();
  });

  it('body: рука в лимите — ход завершён, сверх лимита — нет', () => {
    const state = createState({ phase: PHASES.turnEnd, actionsLeft: 0 });
    expect(turnEnd.body(state)).toBe(true);

    player(state, '0').hand.cards = Array.from(
      { length: rules.maxHandSize + 1 },
      (_, index) => ({ id: `x${index}`, instanceId: `x${index}_0` }),
    );
    expect(turnEnd.body(state)).toBe(false);
  });

  it('exit снимает флаг входа и активные фазы игроков', () => {
    const state = createState({ phase: PHASES.turnEnd, actionsLeft: 0 });
    state.players[0]._activePhase = 'choose';

    const exited = turnEnd.exit(turnEnd.enter(state));
    expect(exited._enteredHooks.turnEnd).toBe(false);
    expect(exited.players[0]._activePhase).toBeNull();
  });

  it('передача хода: turn → turnEnd → turnStart даёт следующего игрока и round++', () => {
    const state = createState({ phase: PHASES.turn, actionsLeft: 0 });
    state.turn = { ...state.turn, index: 1, playerId: '0', actedRound: ['0'] };

    const ended = turn.exit(turn.enter(state));
    const handed = turnEnd.exit(turnEnd.enter(ended));
    const next = turnStart.enter(handed);

    expect(next.turn.playerId).toBe('1');
    expect(next.turn.index).toBe(2);
    expect(next.round).toBe(2);
    expect(next.turn.actedRound).toEqual(['1']);
    expect(ap(next)).toBe(rules.actionsPerTurn);
    expect(next.turn.bonus).toEqual({
      movement: 0,
      attack: 0,
      defense: 0,
      actions: 0,
    });
    expect(next._enteredHooks.turn).toBe(false);
  });
});
