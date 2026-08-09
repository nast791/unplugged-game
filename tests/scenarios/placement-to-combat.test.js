import { describe, expect, it } from 'vitest';
import { runAction, runLifecycle } from '#shared/gameEngine.js';
import { move } from '#shared/actions/move.js';
import { attack } from '#shared/actions/attack.js';
import { defend } from '#shared/actions/defend.js';
import {
  ap,
  createApi,
  createState,
  fighter,
  player,
  PHASES,
} from '../fixtures/state.js';

describe('scenario: placement → combat', () => {
  it('полный цикл до урона и сохранения AP', () => {
    let state = runLifecycle(
      createState({
      phase: PHASES.gameStart,
      actionsLeft: 0,
      players: [
        {
          id: '0',
          name: 'A',
          order: 1,
          placementReady: false,
          hint: null,
          deck: [{ id: 'd1', instanceId: 'd1_0' }],
          hand: [
            {
              id: 'atk',
              instanceId: 'atk_0',
              type: 'attack',
              value: 4,
              bonus: 1,
              fighter: 'alpha',
            },
          ],
          discard: [],
          fighters: [
            fighter({
              id: 'alpha',
              type: 'hero',
              currentPosition: null,
              startPosition: null,
              currentHp: 15,
              move: 2,
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
          order: 2,
          placementReady: false,
          hint: null,
          deck: [],
          hand: [
            {
              id: 'bdef',
              instanceId: 'bdef_0',
              type: 'defense',
              value: 3,
              bonus: 1,
              fighter: 'beta',
            },
          ],
          discard: [],
          fighters: [
            fighter({
              id: 'beta',
              type: 'hero',
              currentPosition: null,
              startPosition: null,
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
          { id: 1, neighbors: [6], position: 1, areas: ['#3B82F6'] },
          { id: 6, neighbors: [1, 7], position: 1, heroStart: true, areas: ['#3B82F6'] },
          { id: 7, neighbors: [6, 8], position: null, areas: ['#94a3b8'] },
          { id: 8, neighbors: [7, 9], position: null, areas: ['#94a3b8'] },
          { id: 9, neighbors: [8, 10], position: null, areas: ['#94a3b8'] },
          { id: 5, neighbors: [10], position: 2, areas: ['#EF4444'] },
          { id: 10, neighbors: [5, 9], position: 2, heroStart: true, areas: ['#EF4444'] },
        ],
      },
    }),
    );

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

    const api = createApi();
    move(state, { playerId: '0', fighterId: 'alpha', cellId: 7 });
    move(state, { playerId: '0', fighterId: 'alpha', cellId: 8 });
    move(state, { playerId: '0', mode: 'confirm' }, api);
    expect(ap(state)).toBe(1);

    move(state, { playerId: '0', fighterId: 'alpha', cellId: 9 });
    state.movement = null;
    player(state).fighters.find(f => f.id === 'alpha').currentPosition = 9;
    state.turn.actionsLeft = 1;

    attack(
      state,
      {
        playerId: '0',
        fighterId: 'alpha',
        targetId: 'beta',
        cardId: 'atk_0',
      },
      api,
    );
    expect(state.combat).toBeTruthy();
    expect(ap(state)).toBe(0);

    const next = defend(
      state,
      { playerId: '1', cardId: 'bdef_0' },
      api,
    );
    expect(next.lastCombat.combatDamage).toBe(1);
    expect(next.players[1].fighters[0].currentHp).toBe(12);
    expect(next.hook).toBe(PHASES.turnEnd);
  });
});
