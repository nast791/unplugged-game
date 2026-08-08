import { describe, expect, it } from 'vitest';
import { place } from '#shared/actions/place.js';
import { move } from '#shared/actions/move.js';
import { attack } from '#shared/actions/attack.js';
import { defend } from '#shared/actions/defend.js';
import {
  createApi,
  createState,
  fighter,
  player,
  PHASES,
} from '../fixtures/state.js';

/**
 * Сквозной сценарий: расстановка → ход → MOVE → ATTACK → DEFEND.
 */
describe('scenario: placement → combat', () => {
  it('полный цикл до урона и сохранения AP', () => {
    const state = createState({
      phase: PHASES.gameStart,
      actionsLeft: 0,
      players: [
        {
          id: '0',
          name: 'A',
          placementReady: false,
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
              currentPosition: 6,
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
          placementReady: false,
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
          { id: 6, neighbors: [1, 7], position: 1, heroStart: true },
          { id: 7, neighbors: [6, 8], position: null },
          { id: 8, neighbors: [7, 9], position: null },
          { id: 9, neighbors: [8, 10], position: null },
          { id: 5, neighbors: [10], position: 2 },
          { id: 10, neighbors: [5, 9], position: 2, heroStart: true },
        ],
      },
    });

    place(state, { playerId: '0', fighterId: 'pawn', cellId: 1 });
    place(state, { playerId: '0', mode: 'confirm' });
    place(state, { playerId: '1', fighterId: 'scout', cellId: 5 });
    place(state, { playerId: '1', mode: 'confirm' });
    expect(state.phase).toBe(PHASES.turnStart);

    // имитация drain: turnStart → turn
    state.phase = PHASES.turn;
    state.actionsLeft = 2;
    state.currentPlayer = '0';

    const api = createApi();
    move(state, { playerId: '0', fighterId: 'alpha', cellId: 7 });
    move(state, { playerId: '0', fighterId: 'alpha', cellId: 8 });
    move(state, { playerId: '0', mode: 'confirm' }, api);
    expect(state.actionsLeft).toBe(1);

    move(state, { playerId: '0', fighterId: 'alpha', cellId: 9 });
    // ещё в movement — атаковать нельзя; confirm сначала нельзя без AP... AP=1
    // закрываем move confirm (потратит последний AP) — тогда attack некуда.
    // Вместо этого: отменим подход — поставим alpha на 9 без второго confirm
    // через прямой state для атаки после первого confirm:
    state.movement = null;
    player(state).fighters.find(f => f.id === 'alpha').currentPosition = 9;
    state.actionsLeft = 1;

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
    expect(state.actionsLeft).toBe(0);

    const next = defend(
      state,
      { playerId: '1', cardId: 'bdef_0' },
      api,
    );
    expect(next.lastCombat.combatDamage).toBe(1);
    expect(next.players[1].fighters[0].currentHp).toBe(12);
    expect(next.phase).toBe(PHASES.turnEnd);
  });
});
