import { describe, expect, it } from 'vitest';
import { move } from '#shared/actions/move.js';
import { createApi, createState, player } from '../fixtures/state.js';

/**
 * Сквозной: усиление перемещения → шаг дальше обычного move → confirm.
 */
describe('scenario: move bonus', () => {
  it('bonus расширяет радиус, confirm тратит AP', () => {
    const state = createState({ actionsLeft: 2 });
    const p = player(state);
    // alpha move=1 → без bonus не дойдёт до 10
    p.fighters.find(f => f.id === 'alpha').move = 1;
    p.fighters.find(f => f.id === 'pawn').position = null;
    player(state, '1').fighters.find(f => f.id === 'beta').position = null;

    const fx = p.hand.find(c => c.id === 'fx'); // bonus 2
    move(state, { playerId: '0', mode: 'bonus', cardId: fx.instanceId });
    expect(state.movement.bonus).toBe(2);

    // радиус 1+2=3 → путь 8→9→10 ок
    move(state, { playerId: '0', fighterId: 'alpha', cellId: 9 });
    move(state, { playerId: '0', fighterId: 'alpha', cellId: 10 });
    expect(p.fighters.find(f => f.id === 'alpha').position).toBe(10);

    const api = createApi();
    const next = move(state, { playerId: '0', mode: 'confirm' }, api);
    expect(next.actionsLeft).toBe(1);
    expect(next.movement).toBeNull();
  });
});
