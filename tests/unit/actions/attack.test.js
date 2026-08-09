import { describe, expect, it } from 'vitest';
import { attack } from '#shared/actions/attack.js';
import { ap, createApi, createState, hand, player } from '../../fixtures/state.js';

describe('ATTACK', () => {
  it('открывает combat и тратит 1 AP', () => {
    const state = createState({ actionsLeft: 2 });
    const p = player(state);
    const atk = hand(p).find(c => c.id === 'atk');
    p.fighters.find(f => f.id === 'alpha').currentPosition = 9;
    p.fighters.find(f => f.id === 'pawn').currentPosition = 8;

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
    expect(ap(state)).toBe(1);
    expect(hand(p).find(c => c.id === 'atk')).toBeUndefined();
  });

  it('out of range → error', () => {
    const state = createState();
    const atk = hand(player(state)).find(c => c.id === 'atk');
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
