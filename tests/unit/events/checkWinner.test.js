import { describe, expect, it } from 'vitest';
import { CHECK_WINNER } from '#shared/events/checkWinner.js';
import { createApi, createState, PHASES } from '../../fixtures/state.js';

describe('CHECK_WINNER', () => {
  it('не меняет state, если живы ≥2 героев', () => {
    const state = createState();
    const api = createApi();
    const next = CHECK_WINNER(state, {}, { api });
    expect(next.hook).toBe(PHASES.turn);
  });

  it('enterGameEnd, если остался 1 герой', () => {
    const state = createState();
    state.players[1].fighters = [];
    const api = createApi();
    const next = CHECK_WINNER(state, {}, { api });
    expect(next.hook).toBe(PHASES.gameEnd);
    expect(next.winner).toBe('0');
  });
});
