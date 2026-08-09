import { describe, expect, it } from 'vitest';
import { DEAL_DAMAGE } from '#shared/events/dealDamage.js';
import { createApi, createState, player, PHASES } from '../../fixtures/state.js';

describe('DEAL_DAMAGE', () => {
  it('снижает HP', () => {
    const state = createState();
    const api = createApi();
    DEAL_DAMAGE(state, { fighterId: 'beta', damage: 3 }, { api });
    expect(player(state, '1').fighters[0].currentHp).toBe(10);
  });

  it('убирает бойца при HP ≤ 0', () => {
    const state = createState();
    const api = createApi();
    DEAL_DAMAGE(state, { fighterId: 'pawn', damage: 99 }, { api });
    expect(player(state).fighters.find(f => f.id === 'pawn')).toBeUndefined();
  });

  it('при смерти последнего героя → gameEnd', () => {
    const state = createState();
    const api = createApi();
    const next = DEAL_DAMAGE(
      state,
      { fighterId: 'beta', damage: 99 },
      { api },
    );
    expect(next.hook).toBe(PHASES.gameEnd);
    expect(next.winner).toBe('0');
  });
});
