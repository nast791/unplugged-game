import { describe, expect, it } from 'vitest';
import { runAction, runLifecycle } from '#shared/gameEngine.js';
import {
  ap,
  createState,
  discard,
  fighter,
  hand,
  PHASES,
  player,
} from '../fixtures/state.js';

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

const attackCard = {
  id: 'atk',
  instanceId: 'atk_0',
  type: 'attack',
  value: 4,
  bonus: 1,
  fighter: 'a',
};

const battleSlot = (id, order, fighterId, cards = []) => ({
  ...playerSlot(id, order, fighterId),
  hand: { visibility: [], cards },
});

/** Бой на три стороны: a@1 бьёт b@2 картой atk_0, c@3 не участвует. */
const threeWayBattle = (players = null) =>
  createState({
    phase: PHASES.turn,
    map: threePlayerMap,
    players:
      players ?? [
        battleSlot('0', 1, 'a', [attackCard]),
        battleSlot('1', 2, 'b'),
        battleSlot('2', 3, 'c'),
      ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const openBattle = (players = null) => {
  let state = threeWayBattle(players);
  state = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'atk_0',
    playerId: '0',
  });
  state = runAction(state, {
    type: 'PICK',
    kind: 'fighter',
    id: 'b',
    playerId: '0',
  });
  return state;
};

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

  it('сдача защитника в бою закрывает бой без урона, ход продолжается', () => {
    let state = openBattle();
    expect(state.combat.stage).toBe('defense');
    expect(ap(state)).toBe(1);

    state = runAction(state, { type: 'RESIGN', playerId: '1' });

    expect(state.hook).toBe(PHASES.turn);
    expect(state.combat).toBeNull();
    expect(state.lastCombat).toBeNull();
    expect(player(state, '1').fighters).toHaveLength(0);
    expect(hand(player(state, '0'))).toHaveLength(0);
    expect(discard(player(state, '0')).map(card => card.instanceId)).toEqual([
      'atk_0',
    ]);
    expect(player(state, '2').fighters[0].currentHp).toBe(10);
    expect(ap(state)).toBe(1);
  });

  it('сдача защитника при двух игроках завершает партию и закрывает бой', () => {
    let state = openBattle([
      battleSlot('0', 1, 'a', [attackCard]),
      battleSlot('1', 2, 'b'),
    ]);
    state = runAction(state, { type: 'RESIGN', playerId: '1' });

    expect(state.hook).toBe(PHASES.gameEnd);
    expect(state.winner).toBe('0');
    expect(state.combat).toBeNull();
    expect(state.turn.actionsLeft).toBe(0);
    expect(discard(player(state, '0')).map(card => card.instanceId)).toEqual([
      'atk_0',
    ]);
  });

  it('сдача активного игрока в перемещении передаёт ход следующему', () => {
    let state = threeWayBattle();
    state = runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' });

    expect(state.movement).not.toBeNull();
    expect(player(state, '0').fighters[0].currentHp).toBe(8);

    state = runAction(state, { type: 'RESIGN', playerId: '0' });

    expect(state.hook).toBe(PHASES.turn);
    expect(state.movement).toBeNull();
    expect(state.turn.playerId).toBe('1');
    expect(ap(state)).toBe(2);
    expect(state.winner).toBeNull();
  });
});
