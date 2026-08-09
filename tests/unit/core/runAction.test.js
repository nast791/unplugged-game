import { describe, expect, it } from 'vitest';
import { runAction as runCoreAction } from '#shared/core.js';
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

const placementState = () =>
  createState({
    phase: PHASES.gameStart,
    players: [
      {
        id: '0',
        name: '0',
        order: 1,
        placementReady: false,
        numberedHeroCommitted: false,
        deck: [],
        hand: [],
        discard: [],
        fighters: [
          fighter({ id: '0-hero', type: 'hero', currentHp: 10 }),
          fighter({ id: '0-pawn', type: 'assistant', currentHp: 4 }),
        ],
      },
      {
        id: '1',
        name: '1',
        order: 2,
        placementReady: false,
        numberedHeroCommitted: false,
        deck: [],
        hand: [],
        discard: [],
        fighters: [
          fighter({ id: '1-hero', type: 'hero', currentHp: 10 }),
          fighter({ id: '1-pawn', type: 'assistant', currentHp: 4 }),
        ],
      },
    ],
    map: arenaMap,
  });

describe('core.runAction guards', () => {
  it('отклоняет неизвестный playerId', () => {
    const state = runLifecycle(placementState());
    expect(() =>
      runCoreAction(state, { type: 'UI_OK', playerId: 'missing' }),
    ).toThrow(/нет в партии/);
  });

  it('отклоняет move вне allow-list активной phase', () => {
    const state = runLifecycle(placementState());
    expect(() =>
      runCoreAction(state, { type: 'MOVE', playerId: '0', fighterId: '0-hero' }),
    ).toThrow(/недоступен/);
  });

  it('отклоняет PLACE_FIGHTER после подтверждения расстановки', () => {
    let state = runLifecycle(placementState());
    state = runAction(state, {
      type: 'PLACE_FIGHTER',
      playerId: '0',
      fighterId: '0-pawn',
      cellId: 1,
    });
    state = runAction(state, { type: 'UI_OK', playerId: '0' });
    expect(() =>
      runAction(state, {
        type: 'PLACE_FIGHTER',
        playerId: '0',
        fighterId: '0-pawn',
        cellId: 1,
      }),
    ).toThrow(/подтверждена/);
  });

  it('отклоняет UI_BACK в place (back без onPress)', () => {
    const state = runLifecycle(placementState());
    expect(() => runAction(state, { type: 'UI_BACK', playerId: '0' })).toThrow(
      /UI_BACK/,
    );
  });
});
