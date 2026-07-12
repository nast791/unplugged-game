import { describe, expect, it } from 'vitest';
import { defend } from '#shared/actions/defend.js';
import { createApi, createState, player, PHASES } from '../../fixtures/state.js';

const withCombat = (actionsLeft = 1) =>
  createState({
    actionsLeft,
    combat: {
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackerFighterId: 'alpha',
      targetFighterId: 'beta',
      attackValue: 4,
    },
  });

describe('DEFEND', () => {
  it('пас: полный урон, AP>0 — ход продолжается', () => {
    const state = withCombat(1);
    const api = createApi();
    const next = defend(state, { playerId: '1' }, api);
    expect(next.combat).toBeNull();
    expect(next.lastCombat.combatDamage).toBe(4);
    expect(next.phase).toBe(PHASES.turn);
    expect(next.actionsLeft).toBe(1);
  });

  it('картой снижает урон', () => {
    const state = withCombat(2);
    const def = player(state, '1').hand.find(c => c.id === 'bdef');
    const api = createApi();
    defend(
      state,
      { playerId: '1', cardId: def.instanceId },
      api,
    );
    expect(state.lastCombat.combatDamage).toBe(1);
    expect(state.players[1].fighters[0].currentHp).toBe(12);
  });

  it('при AP=0 после боя → enterTurnEnd', () => {
    const state = withCombat(0);
    const api = createApi();
    const next = defend(state, { playerId: '1' }, api);
    expect(next.phase).toBe(PHASES.turnEnd);
  });
});
