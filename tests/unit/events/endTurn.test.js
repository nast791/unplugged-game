import { describe, expect, it } from 'vitest';
import { END_TURN } from '#shared/events/endTurn.js';
import { ap, createApi, createState, PHASES } from '../../fixtures/state.js';

describe('END_TURN', () => {
  it('при AP > 0 делает STANDSTILL (−1 AP)', () => {
    const state = createState({ actionsLeft: 2 });
    const api = createApi();
    const next = END_TURN(state, { playerId: '0' }, { api });
    expect(ap(next)).toBe(1);
    expect(next.hook).toBe(PHASES.turn);
  });

  it('при AP = 0 вызывает enterTurnEnd', () => {
    const state = createState({ actionsLeft: 0 });
    const api = createApi();
    const next = END_TURN(state, { playerId: '0' }, { api });
    expect(next.hook).toBe(PHASES.turnEnd);
  });
});
