import { describe, expect, it } from 'vitest';
import { rules } from '#shared/constants/rules.js';
import turn from '#shared/lifecycle/turn.js';
import { createState, PHASES } from '../../fixtures/state.js';

const card = index => ({
  id: `c${index}`,
  instanceId: `c${index}_0`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

const handOf = count => ({
  visibility: [],
  cards: Array.from({ length: count }, (_, index) => card(index)),
});

const turnState = patch => createState({ phase: PHASES.turn, ...patch });

describe('lifecycle turn: каркас хука', () => {
  it('enter помечает вход и не повторяется внутри хода', () => {
    const entered = turn.enter(turnState());
    expect(entered._enteredHooks.turn).toBe(true);

    entered.movement = { playerId: '0', origins: {}, bonus: 0 };
    const again = turn.enter(entered);
    expect(again.movement).toEqual({ playerId: '0', origins: {}, bonus: 0 });
  });

  it('enter снимает моменты прошлого действия', () => {
    const state = turnState();
    state.movement = { playerId: '0', origins: {}, bonus: 0 };
    state.combat = { stage: 'defense' };
    state.targeting = { playerId: '0', candidates: [] };

    const entered = turn.enter(state);
    expect(entered.movement).toBeNull();
    expect(entered.combat).toBeNull();
    expect(entered.targeting).toBeNull();
  });

  it('enter сохраняет итог последнего действия: его снимает объявление нового', () => {
    const state = turnState();
    state.lastCombat = { combatDamage: 1 };

    const entered = turn.enter(state);
    expect(entered.lastCombat).toEqual({ combatDamage: 1 });
  });

  it('body: ход не закрыт, пока есть действия', () => {
    const state = turn.enter(turnState({ actionsLeft: 1 }));
    expect(turn.body(state)).toBe(false);
  });

  it('body: ход не закрыт, пока идёт момент', () => {
    const moments = [
      { movement: { playerId: '0', origins: {}, bonus: 0 } },
      { combat: { stage: 'defense' } },
      { targeting: { playerId: '0', candidates: [] } },
    ];
    for (const moment of moments) {
      const state = { ...turnState({ actionsLeft: 0 }), ...moment };
      expect(turn.body(state)).toBe(false);
    }
  });

  it('body: ход не закрыт, пока рука сверх лимита', () => {
    const state = turnState({ actionsLeft: 0 });
    state.players[0].hand = handOf(rules.maxHandSize + 1);
    expect(turn.body(state)).toBe(false);
  });

  it('body: ход закрыт при 0 действий, без моментов и в лимите руки', () => {
    const state = turn.enter(turnState({ actionsLeft: 0 }));
    expect(turn.body(state)).toBe(true);
  });

  it('exit снимает моменты, флаг входа и активную фазу игроков', () => {
    const state = turnState({ actionsLeft: 0 });
    state.movement = { playerId: '0', origins: {}, bonus: 0 };
    state.players[0]._activePhase = 'movement';

    const exited = turn.exit(turn.enter(state));
    expect(exited.movement).toBeNull();
    expect(exited._enteredHooks.turn).toBe(false);
    expect(exited.players[0]._activePhase).toBeNull();
  });
});
