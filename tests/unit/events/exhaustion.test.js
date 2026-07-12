import { describe, expect, it } from 'vitest';
import { EXHAUSTION } from '#shared/events/exhaustion.js';
import { createApi, createState, player } from '../../fixtures/state.js';

describe('EXHAUSTION', () => {
  it('наносит урон всем живым героям игрока', () => {
    const state = createState();
    const p = player(state);
    const hp = p.fighters.find(f => f.id === 'alpha').currentHp;
    const api = createApi();
    EXHAUSTION(state, { damage: 2 }, { player: p, api });
    expect(p.fighters.find(f => f.id === 'alpha').currentHp).toBe(hp - 2);
  });
});
