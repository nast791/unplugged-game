import { describe, expect, it } from 'vitest';
import { createCardEngine } from '@nast791/cards/core';
import { effects, facts } from '#shared/cardEffects.js';
import { RUN_COMBAT } from '#shared/events/resolveCombat.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createApi, createState, player } from '../../fixtures/state.js';

const deathGaze = medusaCards.find(c => c.id === 'medusa_01');

describe('medusa_01 Взгляд смерти', () => {
  it('после победы атакующего: +8 урона цели', () => {
    const state = createState({
      combat: {
        attackerPlayerId: '0',
        defenderPlayerId: '1',
        attackerFighterId: 'alpha',
        targetFighterId: 'beta',
        attackValue: 2,
        attackCard: { ...deathGaze, instanceId: 'medusa_01_0' },
      },
    });
    const cards = createCardEngine({ effects, facts });
    const hpBefore = player(state, '1').fighters[0].currentHp;

    const next = RUN_COMBAT(
      state,
      { combat: state.combat, defenseValue: 0 },
      { api: createApi(), cards },
    );

    // value 2 + эффект 8
    expect(next.lastCombat.winner).toBe('attacker');
    expect(next.lastCombat.combatDamage).toBe(2);
    expect(player(next, '1').fighters[0].currentHp).toBe(hpBefore - 10);
  });

  it('при победе защитника эффект не срабатывает', () => {
    const state = createState({
      combat: {
        attackerPlayerId: '0',
        defenderPlayerId: '1',
        attackerFighterId: 'alpha',
        targetFighterId: 'beta',
        attackValue: 2,
        attackCard: { ...deathGaze, instanceId: 'medusa_01_0' },
      },
    });
    const cards = createCardEngine({ effects, facts });
    const hpBefore = player(state, '1').fighters[0].currentHp;

    const next = RUN_COMBAT(
      state,
      { combat: state.combat, defenseValue: 5 },
      { api: createApi(), cards },
    );

    expect(next.lastCombat.winner).toBe('defender');
    expect(player(next, '1').fighters[0].currentHp).toBe(hpBefore);
  });
});
