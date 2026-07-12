import { describe, expect, it } from 'vitest';
import { STANDSTILL } from '#shared/events/standstill.js';
import { createApi, createState, player, PHASES } from '../../fixtures/state.js';

describe('STANDSTILL', () => {
  it('добор + −1 AP при непустой колоде', () => {
    const state = createState({ actionsLeft: 2, movement: { playerId: '0' } });
    const p = player(state);
    const handBefore = p.hand.length;
    const api = createApi();
    STANDSTILL(state, {}, { player: p, api });
    expect(state.movement).toBeNull();
    expect(state.actionsLeft).toBe(1);
    expect(p.hand.length).toBe(handBefore + 1);
  });

  it('при AP → 0 вызывает enterTurnEnd', () => {
    const state = createState({ actionsLeft: 1 });
    const api = createApi();
    const next = STANDSTILL(state, {}, { player: player(state), api });
    expect(next.phase).toBe(PHASES.turnEnd);
  });
});
