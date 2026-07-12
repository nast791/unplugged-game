import { describe, expect, it } from 'vitest';
import { attack } from '#shared/actions/attack.js';
import { createApi, createState, player } from '../../fixtures/state.js';

describe('ATTACK', () => {
  it('открывает combat и тратит 1 AP', () => {
    const state = createState({ actionsLeft: 2 });
    // pawn@9 adjacent to beta@10
    const p = player(state);
    const atk = p.hand.find(c => c.id === 'atk');
    // card.fighter=alpha but alpha@8 not adjacent to beta@10 (dist=2, range=1)
    // move alpha to 9 first via mutating, or use attack from pawn — card binds to alpha
    p.fighters.find(f => f.id === 'alpha').position = 9;
    p.fighters.find(f => f.id === 'pawn').position = 8;

    const api = createApi();
    attack(
      state,
      {
        playerId: '0',
        fighterId: 'alpha',
        targetId: 'beta',
        cardId: atk.instanceId,
      },
      api,
    );

    expect(state.combat).toMatchObject({
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackValue: 4,
      targetFighterId: 'beta',
    });
    expect(state.actionsLeft).toBe(1);
    expect(p.hand.find(c => c.id === 'atk')).toBeUndefined();
  });

  it('out of range → error', () => {
    const state = createState();
    const atk = player(state).hand.find(c => c.id === 'atk');
    expect(() =>
      attack(state, {
        playerId: '0',
        fighterId: 'alpha',
        targetId: 'beta',
        cardId: atk.instanceId,
      }),
    ).toThrow(/out of range|вне|range/i);
  });
});
