import { describe, expect, it } from 'vitest';
import { move } from '#shared/actions/move.js';
import { ap, createApi, createState, hand, player } from '../fixtures/state.js';

describe('scenario: move bonus', () => {
  it('bonus расширяет радиус, confirm тратит AP', () => {
    const state = createState({ actionsLeft: 2 });
    const p = player(state);
    p.fighters.find(f => f.id === 'alpha').move = 1;
    p.fighters.find(f => f.id === 'pawn').currentPosition = null;
    player(state, '1').fighters.find(f => f.id === 'beta').currentPosition = null;

    const fx = hand(p).find(c => c.id === 'fx');
    move(state, { playerId: '0', mode: 'bonus', cardId: fx.instanceId });
    expect(state.movement.bonus).toBe(2);

    move(state, { playerId: '0', fighterId: 'alpha', cellId: 9 });
    move(state, { playerId: '0', fighterId: 'alpha', cellId: 10 });
    expect(p.fighters.find(f => f.id === 'alpha').currentPosition).toBe(10);

    const api = createApi();
    const next = move(state, { playerId: '0', mode: 'confirm' }, api);
    expect(ap(next)).toBe(1);
    expect(next.movement).toBeNull();
  });
});
