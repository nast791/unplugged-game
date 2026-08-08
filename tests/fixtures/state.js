import { PHASES } from '@nast791/engine/constants';

/** Мок api хоста для events/actions. */
export const createApi = () => ({
  enterTurnEnd: state => ({
    ...state,
    phase: PHASES.turnEnd,
  }),
  enterGameEnd: (state, winner) => ({
    ...state,
    phase: PHASES.gameEnd,
    winner: winner === undefined ? state.winner : winner,
    actionsLeft: 0,
  }),
});

const card = (partial) => ({
  type: 'effect',
  value: 0,
  bonus: 1,
  ...partial,
  instanceId: partial.instanceId ?? `${partial.id}_0`,
});

const fighter = (partial) => ({
  type: 'hero',
  move: 2,
  attackRange: 1,
  currentHp: 10,
  ...partial,
});

/** Миникарта: 8—9—10 (соседи), удобно для MOVE/ATTACK. */
export const miniMap = {
  id: 'test',
  name: 'Test',
  nodes: [
    { id: 8, neighbors: [9], x: 0, y: 0 },
    { id: 9, neighbors: [8, 10], x: 1, y: 0 },
    { id: 10, neighbors: [9], x: 2, y: 0 },
  ],
};

/**
 * Базовый state для unit/scenario тестов.
 * @param {object} [patch]
 */
export const createState = (patch = {}) => {
  const state = {
    id: 'test-game',
    phase: PHASES.turn,
    currentPlayer: '0',
    turn: 0,
    actionsLeft: 2,
    winner: null,
    combat: null,
    movement: null,
    handDiscard: null,
    effectPrompt: null,
    lastCombat: null,
    lastBonus: null,
    rules: {
      startingPlayer: '0',
      actionsPerTurn: 2,
      handSize: 5,
      maxHandSize: 7,
    },
    map: structuredClone(miniMap),
    players: [
      {
        id: '0',
        name: 'Alpha',
        placementReady: true,
        deck: [
          card({ id: 'deck_a', title: 'DeckA', bonus: 1 }),
          card({ id: 'deck_b', title: 'DeckB', bonus: 1 }),
        ],
        hand: [
          card({
            id: 'atk',
            title: 'Atk',
            type: 'attack',
            value: 4,
            bonus: 1,
            fighter: 'alpha',
          }),
          card({
            id: 'def',
            title: 'Def',
            type: 'defense',
            value: 2,
            bonus: 1,
            fighter: 'alpha',
          }),
          card({
            id: 'fx',
            title: 'Fx',
            type: 'effect',
            value: 0,
            bonus: 2,
            fighter: 'alpha',
            events: [{ type: 'DRAW_CARDS', count: 1 }],
          }),
        ],
        discard: [],
        fighters: [
          fighter({
            id: 'alpha',
            name: 'Alpha',
            type: 'hero',
            currentPosition: 8,
            currentHp: 15,
          }),
          fighter({
            id: 'pawn',
            name: 'Pawn',
            type: 'assistant',
            currentPosition: 9,
            currentHp: 4,
            move: 2,
          }),
        ],
      },
      {
        id: '1',
        name: 'Beta',
        placementReady: true,
        deck: [card({ id: 'deck_c', bonus: 1 })],
        hand: [
          card({
            id: 'bdef',
            title: 'BDef',
            type: 'defense',
            value: 3,
            bonus: 1,
            fighter: 'beta',
          }),
        ],
        discard: [],
        fighters: [
          fighter({
            id: 'beta',
            name: 'Beta',
            type: 'hero',
            currentPosition: 10,
            currentHp: 13,
          }),
        ],
      },
    ],
    ...patch,
  };

  if (patch.players) state.players = patch.players;
  if (patch.map) state.map = patch.map;
  if (patch.rules) state.rules = { ...state.rules, ...patch.rules };

  return structuredClone(state);
};

export const player = (state, id = '0') =>
  state.players.find(p => String(p.id) === String(id));

export { card, fighter, PHASES };
