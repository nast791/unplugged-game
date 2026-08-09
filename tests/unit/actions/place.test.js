import { describe, expect, it } from 'vitest';
import { runAction, runLifecycle } from '#shared/gameEngine.js';
import { createState, fighter, PHASES } from '../../fixtures/state.js';

const arenaMap = {
  id: 'arena',
  nodes: [
    { id: 1, neighbors: [6], position: 1, areas: ['#3B82F6'] },
    { id: 6, neighbors: [1], position: 1, heroStart: true, areas: ['#3B82F6'] },
    { id: 5, neighbors: [10], position: 2, areas: ['#EF4444'] },
    { id: 10, neighbors: [5], position: 2, heroStart: true, areas: ['#EF4444'] },
  ],
};

const playerSlot = id => ({
  id,
  name: id,
  order: Number(id) + 1,
  placementReady: false,
  numberedHeroCommitted: false,
  deck: [],
  hand: [],
  discard: [],
  fighters: [
    fighter({
      id: 'alpha',
      type: 'hero',
      currentPosition: null,
      currentHp: 15,
    }),
    fighter({
      id: 'pawn',
      type: 'assistant',
      currentPosition: null,
      currentHp: 4,
    }),
  ],
});

const placementState = () =>
  createState({
    phase: PHASES.gameStart,
    players: [playerSlot('0'), { ...playerSlot('1'), fighters: [
      fighter({ id: 'beta', type: 'hero', currentPosition: null, currentHp: 13 }),
      fighter({ id: 'scout', type: 'assistant', currentPosition: null, currentHp: 3 }),
    ]}],
    map: arenaMap,
  });

describe('PLACE_FIGHTER (core)', () => {
  it('ставит помощника в стартовую область', () => {
    let state = runLifecycle(placementState());
    state = runAction(state, {
      type: 'PLACE_FIGHTER',
      playerId: '0',
      fighterId: 'pawn',
      cellId: 1,
    });
    expect(
      state.players[0].fighters.find(f => f.id === 'pawn').currentPosition,
    ).toBe(1);
  });

  it('запрещает двигать locked hero', () => {
    let state = runLifecycle(placementState());
    const hero = state.players[0].fighters.find(f => f.id === 'alpha');
    expect(hero.currentPosition).toBe(6);
    expect(() =>
      runAction(state, {
        type: 'PLACE_FIGHTER',
        playerId: '0',
        fighterId: 'alpha',
        cellId: 1,
      }),
    ).toThrow(/номерной/);
  });

  it('запрещает клетку другого цвета', () => {
    let state = runLifecycle(
      createState({
        phase: PHASES.gameStart,
        players: [playerSlot('0')],
        map: {
          id: 'arena',
          nodes: [
            { id: 1, neighbors: [6, 7], position: 1, areas: ['#3B82F6'] },
            { id: 6, neighbors: [1], position: 1, heroStart: true, areas: ['#3B82F6'] },
            { id: 7, neighbors: [1], position: 1, areas: ['#94a3b8'] },
          ],
        },
      }),
    );
    expect(() =>
      runAction(state, {
        type: 'PLACE_FIGHTER',
        playerId: '0',
        fighterId: 'pawn',
        cellId: 7,
      }),
    ).toThrow(/области расстановки/);
  });

  it('UI_OK обоих → turnStart', () => {
    let state = runLifecycle(placementState());
    state = runAction(state, {
      type: 'PLACE_FIGHTER',
      playerId: '0',
      fighterId: 'pawn',
      cellId: 1,
    });
    state = runAction(state, { type: 'UI_OK', playerId: '0' });
    state = runAction(state, {
      type: 'PLACE_FIGHTER',
      playerId: '1',
      fighterId: 'scout',
      cellId: 5,
    });
    state = runAction(state, { type: 'UI_OK', playerId: '1' });
    expect(state.hook).toBe(PHASES.turn);
  });
});
