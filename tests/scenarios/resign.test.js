import { describe, expect, it } from 'vitest';
import { runAction, runLifecycle } from '#shared/gameEngine.js';
import { createState, fighter, PHASES } from '../fixtures/state.js';

/** Карта на трёх игроков: у каждого своя номерная клетка. */
const threePlayerMap = {
  id: 'tri',
  nodes: [
    { id: 1, neighbors: [2], position: 1, heroStart: true, areas: ['#a'] },
    { id: 2, neighbors: [1, 3], position: 2, heroStart: true, areas: ['#b'] },
    { id: 3, neighbors: [2], position: 3, heroStart: true, areas: ['#c'] },
  ],
};

const playerSlot = (id, order, fighterId) => ({
  id,
  name: id,
  order,
  placementReady: false,
  numberedHeroCommitted: false,
  deck: { visibility: [], cards: [] },
  hand: { visibility: [], cards: [] },
  discard: { visibility: [], cards: [] },
  fighters: [fighter({ id: fighterId, type: 'hero', currentPosition: order })],
});

const threePlayers = () => [
  playerSlot('0', 1, 'a'),
  playerSlot('1', 2, 'b'),
  playerSlot('2', 3, 'c'),
];

describe('scenario: сдача партии (RESIGN)', () => {
  it('доступен в любой фазе и завершает партию, когда сторона осталась одна', () => {
    const state = createState({ phase: PHASES.turn });
    const next = runAction(state, { type: 'RESIGN', playerId: '1' });

    expect(next.hook).toBe('gameEnd');
    expect(next.winner).toBe('0');
    expect(next.players[1].resigned).toBe(true);
    expect(next.players[1].fighters).toHaveLength(0);
    expect(next.turn.actionsLeft).toBe(0);
  });

  it('при трёх игроках партия продолжается, сдавшийся пропускается', () => {
    const state = createState({
      phase: PHASES.turn,
      map: threePlayerMap,
      players: threePlayers(),
    });
    state.turn = { ...state.turn, playerId: '0', actedRound: ['0'], actionsLeft: 0 };
    state._enteredHooks = { turn: true };

    const afterResign = runAction(state, { type: 'RESIGN', playerId: '1' });
    expect(afterResign.hook).toBe(PHASES.turn);
    expect(afterResign.players.find(p => p.id === '1').resigned).toBe(true);
    expect(afterResign.winner).toBeNull();

    const next = runLifecycle(afterResign);
    expect(next.hook).toBe(PHASES.turn);
    expect(next.turn.playerId).toBe('2');
  });

  it('во время расстановки сдавшийся не блокирует остальных', () => {
    const state = createState({
      phase: PHASES.gameStart,
      map: threePlayerMap,
      players: threePlayers(),
      turn: { playerId: null, actedRound: [] },
    });

    let next = runAction(state, { type: 'RESIGN', playerId: '1' });
    expect(next.hook).toBe(PHASES.gameStart);

    next = runAction(next, { type: 'UI_OK', playerId: '0' });
    expect(next.hook).toBe(PHASES.gameStart);

    next = runAction(next, { type: 'UI_OK', playerId: '2' });
    expect(next.hook).toBe(PHASES.turn);
    expect(next.turn.playerId).toBe('0');
  });

  it('отклоняет повторную сдачу и неизвестного игрока', () => {
    const state = createState({
      phase: PHASES.turn,
      map: threePlayerMap,
      players: threePlayers(),
    });
    const after = runAction(state, { type: 'RESIGN', playerId: '1' });

    expect(() => runAction(after, { type: 'RESIGN', playerId: '1' })).toThrow(
      /уже сдался/,
    );
    expect(() => runAction(after, { type: 'RESIGN', playerId: 'nope' })).toThrow(
      /нет в партии/,
    );
  });

  it('после gameEnd ход отклоняется', () => {
    const state = createState({ phase: PHASES.turn });
    const ended = runAction(state, { type: 'RESIGN', playerId: '1' });

    expect(() => runAction(ended, { type: 'PICK', kind: 'deck', playerId: '0' })).toThrow(
      /партия завершена/,
    );
  });
});
