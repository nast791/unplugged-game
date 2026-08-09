import { describe, expect, it } from 'vitest';
import { STANDSTILL } from '#shared/events/standstill.js';
import { ap, createApi, createState, hand, player, PHASES } from '../../fixtures/state.js';

describe('STANDSTILL', () => {
  it('добор + −1 AP при непустой колоде', () => {
    const state = createState({ actionsLeft: 2, movement: { playerId: '0' } });
    const p = player(state);
    const handBefore = hand(p).length;
    const api = createApi();
    STANDSTILL(state, {}, { player: p, api });
    expect(state.movement).toBeNull();
    expect(ap(state)).toBe(1);
    expect(hand(p).length).toBe(handBefore + 1);
  });

  it('при AP → 0 вызывает enterTurnEnd', () => {
    const state = createState({ actionsLeft: 1 });
    const api = createApi();
    const next = STANDSTILL(state, {}, { player: player(state), api });
    expect(next.hook).toBe(PHASES.turnEnd);
  });
});
