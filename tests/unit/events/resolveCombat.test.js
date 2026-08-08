import { describe, expect, it } from 'vitest';
import { createCardEngine } from '@nast791/cards/core';
import {
  RESOLVE_COMBAT,
  RUN_COMBAT,
  buildCombatSteps,
  resolveCombatWinner,
} from '#shared/events/resolveCombat.js';
import { combat } from '#shared/constants/hooks.js';
import { PHASE } from '#shared/facts/moment.js';
import { createApi, createState, player } from '../../fixtures/state.js';

describe('combat hooks', () => {
  it('порядок 1→4 и before/after', () => {
    expect(combat.map(h => h.name)).toEqual([
      'instant',
      'during_combat',
      'after_combat',
    ]);
    expect(
      combat.filter(h => h.combat === 'before').map(h => h.name),
    ).toEqual(['instant', 'during_combat']);
    expect(combat.filter(h => h.combat === 'after').map(h => h.name)).toEqual([
      'after_combat',
    ]);
  });

  it('buildCombatSteps: defender до attacker, numbers в середине', () => {
    const steps = buildCombatSteps();
    const kinds = steps.map(s =>
      s.kind === 'numbers' ? 'numbers' : `${s.hook}:${s.role}`,
    );
    expect(kinds).toEqual([
      'instant:defender',
      'instant:attacker',
      'during_combat:defender',
      'during_combat:attacker',
      'numbers',
      'after_combat:defender',
      'after_combat:attacker',
    ]);
  });
});

describe('resolveCombatWinner / RESOLVE_COMBAT', () => {
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

describe('RUN_COMBAT', () => {
  const attackCardWithAfter = {
    id: 'atk_fx',
    type: 'attack',
    value: 4,
    effects: [
      {
        id: 'bonus_hit',
        triggers: [{ fact: 'PHASE', params: { id: 'after_combat' } }],
        events: [
          { type: 'DEAL_DAMAGE', fighterId: 'beta', damage: 3 },
        ],
      },
    ],
  };

  it('after_combat эффект атакующего после чисел', () => {
    const state = createState({
      combat: {
        attackerPlayerId: '0',
        defenderPlayerId: '1',
        attackerFighterId: 'alpha',
        targetFighterId: 'beta',
        attackValue: 4,
        attackCard: attackCardWithAfter,
      },
    });
    const order = [];
    const cards = createCardEngine({
      effects: {
        DEAL_DAMAGE: (ctx, { fighterId, damage }) => {
          order.push(`dmg:${fighterId}:${damage}`);
          const f = ctx.state.players[1].fighters[0];
          f.currentHp -= damage;
          return ctx;
        },
      },
      facts: { PHASE },
    });

    const hpBefore = player(state, '1').fighters[0].currentHp;
    const next = RUN_COMBAT(
      state,
      { combat: state.combat, defenseValue: 0 },
      { api: createApi(), cards },
    );

    expect(next.combatFlow).toBeNull();
    expect(next.lastCombat.combatDamage).toBe(4);
    // numbers 4 + after 3
    expect(player(next, '1').fighters[0].currentHp).toBe(hpBefore - 7);
    expect(order).toEqual(['dmg:beta:3']);
  });

  it('в одной фазе сначала defender, потом attacker', () => {
    const state = createState({
      combat: {
        attackerPlayerId: '0',
        defenderPlayerId: '1',
        attackerFighterId: 'alpha',
        targetFighterId: 'beta',
        attackValue: 1,
        attackCard: {
          id: 'a',
          effects: [
            {
              triggers: [{ fact: 'PHASE', params: { id: 'during_combat' } }],
              events: [{ type: 'MARK', who: 'attacker' }],
            },
          ],
        },
      },
    });
    const defenseCard = {
      id: 'd',
      type: 'defense',
      value: 0,
      effects: [
        {
          triggers: [{ fact: 'PHASE', params: { id: 'during_combat' } }],
          events: [{ type: 'MARK', who: 'defender' }],
        },
      ],
    };
    const order = [];
    const cards = createCardEngine({
      effects: {
        MARK: (ctx, { who }) => {
          order.push(who);
          return ctx;
        },
      },
      facts: { PHASE },
    });

    RUN_COMBAT(
      state,
      { combat: state.combat, defenseValue: 0, defenseCard },
      { api: createApi(), cards },
    );

    expect(order).toEqual(['defender', 'attacker']);
  });
});
