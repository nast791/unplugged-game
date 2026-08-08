import { describe, expect, it } from 'vitest';
import { move } from '#shared/actions/move.js';
import { createApi, createState, player } from '../../fixtures/state.js';

describe('MOVE', () => {
  it('шаг в радиусе move', () => {
    const state = createState();
    player(state).fighters.find(f => f.id === 'pawn').currentPosition = null;
    move(state, { playerId: '0', fighterId: 'alpha', cellId: 9 });
    expect(player(state).fighters.find(f => f.id === 'alpha').currentPosition).toBe(9);
    expect(state.movement.origins.alpha).toBe(8);
  });

  it('mode bonus усиливает радиус', () => {
    const state = createState();
    const p = player(state);
    const fx = p.hand.find(c => c.id === 'fx');
    move(state, { playerId: '0', mode: 'bonus', cardId: fx.instanceId });
    expect(state.movement.bonus).toBe(2);
    expect(state.movement.bonusApplied).toBe(true);
  });

  it('confirm → STANDSTILL (−1 AP)', () => {
    const state = createState({ actionsLeft: 2 });
    player(state).fighters.find(f => f.id === 'pawn').currentPosition = null;
    const api = createApi();
    move(state, { playerId: '0', fighterId: 'alpha', cellId: 9 });
    const next = move(state, { playerId: '0', mode: 'confirm' }, api);
    expect(next.actionsLeft).toBe(1);
    expect(next.movement).toBeNull();
  });

  it('может пройти через своего бойца', () => {
    const state = createState();
    player(state, '1').fighters.find(f => f.id === 'beta').currentPosition = null;
    player(state).fighters.find(f => f.id === 'alpha').move = 2;
    move(state, { playerId: '0', fighterId: 'alpha', cellId: 10 });
    expect(player(state).fighters.find(f => f.id === 'alpha').currentPosition).toBe(10);
  });

  it('не может пройти через чужого бойца', () => {
    const state = createState();
    player(state).fighters.find(f => f.id === 'pawn').currentPosition = null;
    player(state, '1').fighters.find(f => f.id === 'beta').currentPosition = 9;
    player(state).fighters.find(f => f.id === 'alpha').move = 2;
    expect(() =>
      move(state, { playerId: '0', fighterId: 'alpha', cellId: 10 }),
    ).toThrow(/вне радиуса/);
  });

  it('запрещает клетку вне радиуса', () => {
    const state = createState();
    player(state).fighters.find(f => f.id === 'pawn').currentPosition = null;
    player(state, '1').fighters.find(f => f.id === 'beta').currentPosition = null;
    player(state).fighters.find(f => f.id === 'alpha').move = 1;
    expect(() =>
      move(state, { playerId: '0', fighterId: 'alpha', cellId: 10 }),
    ).toThrow(/вне радиуса/);
  });
});
