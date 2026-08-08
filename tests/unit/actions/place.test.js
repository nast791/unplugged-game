import { describe, expect, it } from 'vitest';
import { place } from '#shared/actions/place.js';
import { createState, fighter, PHASES } from '../../fixtures/state.js';

const placementState = () =>
  createState({
    phase: PHASES.gameStart,
    players: [
      {
        id: '0',
        name: 'A',
        placementReady: false,
        deck: [],
        hand: [],
        discard: [],
        fighters: [
          fighter({
            id: 'alpha',
            type: 'hero',
            currentPosition: 6,
            currentHp: 15,
          }),
          fighter({
            id: 'pawn',
            type: 'assistant',
            currentPosition: null,
            currentHp: 4,
          }),
        ],
      },
      {
        id: '1',
        name: 'B',
        placementReady: false,
        deck: [],
        hand: [],
        discard: [],
        fighters: [
          fighter({
            id: 'beta',
            type: 'hero',
            currentPosition: 10,
            currentHp: 13,
          }),
          fighter({
            id: 'scout',
            type: 'assistant',
            currentPosition: null,
            currentHp: 3,
          }),
        ],
      },
    ],
    map: {
      id: 'arena',
      nodes: [
        { id: 1, neighbors: [6], position: 1 },
        { id: 6, neighbors: [1], position: 1, heroStart: true },
        { id: 5, neighbors: [10], position: 2 },
        { id: 10, neighbors: [5], position: 2, heroStart: true },
      ],
    },
  });

describe('PLACE', () => {
  it('ставит помощника в стартовую область', () => {
    const state = placementState();
    place(state, { playerId: '0', fighterId: 'pawn', cellId: 1 });
    expect(
      state.players[0].fighters.find(f => f.id === 'pawn').currentPosition,
    ).toBe(1);
  });

  it('запрещает двигать героя', () => {
    const state = placementState();
    expect(() =>
      place(state, { playerId: '0', fighterId: 'alpha', cellId: 1 }),
    ).toThrow(/герой/);
  });

  it('confirm обоих → turnStart', () => {
    const state = placementState();
    place(state, { playerId: '0', fighterId: 'pawn', cellId: 1 });
    place(state, { playerId: '0', mode: 'confirm' });
    place(state, { playerId: '1', fighterId: 'scout', cellId: 5 });
    place(state, { playerId: '1', mode: 'confirm' });
    expect(state.phase).toBe(PHASES.turnStart);
  });
});
