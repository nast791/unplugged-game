import { describe, expect, it } from 'vitest';
import {
  RESOLVE_COMBAT,
  resolveCombatWinner,
} from '#shared/events/resolveCombat.js';
import { createApi, createState } from '../../fixtures/state.js';

describe('resolveCombatWinner', () => {
  it('атакующий побеждает при уроне > 0', () => {
    expect(resolveCombatWinner({ attackValue: 4, defenseValue: 2 })).toEqual({
      attack: 4,
      defense: 2,
      combatDamage: 2,
      winner: 'attacker',
    });
  });

  it('защитник побеждает при уроне 0', () => {
    expect(resolveCombatWinner({ attackValue: 2, defenseValue: 5 }).winner).toBe(
      'defender',
    );
  });
});

describe('RESOLVE_COMBAT', () => {
  it('пишет lastCombat и наносит урон', () => {
    const state = createState({
      combat: {
        attackerPlayerId: '0',
        defenderPlayerId: '1',
        attackerFighterId: 'alpha',
        targetFighterId: 'beta',
        attackValue: 4,
      },
    });
    const api = createApi();
    RESOLVE_COMBAT(
      state,
      { combat: state.combat, defenseValue: 3, defendedWithCard: true },
      { api },
    );
    expect(state.combat).toBeNull();
    expect(state.lastCombat.combatDamage).toBe(1);
    expect(state.lastCombat.winner).toBe('attacker');
    expect(state.players[1].fighters[0].currentHp).toBe(12);
  });
});
