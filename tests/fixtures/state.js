import { rules } from '#shared/constants/rules.js';
import { CHECK_HAND_LIMIT } from '#shared/events/index.js';
import { createPartyApi } from '#shared/gameEngine.js';
import { zoneCards } from '#shared/helpers.js';

/** Имена lifecycle-хуков для тестов. */
export const PHASES = {
  gameStart: 'gameStart',
  turnStart: 'turnStart',
  turn: 'turn',
  turnEnd: 'turnEnd',
  gameEnd: 'gameEnd',
};

export const ap = state => state.turn?.actionsLeft;
export const hand = player => zoneCards(player?.hand);
export const deck = player => zoneCards(player?.deck);
export const discard = player => zoneCards(player?.discard);

/** Мок api для unit-тестов actions/events. */
export const createApi = () =>
  createPartyApi({
    beforeEnterTurnEnd: (state, api) => CHECK_HAND_LIMIT(state, {}, api),
  });

const card = partial => ({
  type: 'effect',
  value: 0,
  bonus: 1,
  ...partial,
  instanceId: partial.instanceId ?? `${partial.id}_0`,
});

const fighter = partial => ({
  type: 'hero',
  move: 2,
  attackRange: 1,
  currentHp: 10,
  ...partial,
});

const zone = cards => ({ visibility: [], cards: [...cards] });

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
 * Базовый state партии (host format: hook, turn, zones).
 * @param {object} [patch]
 */
export const createState = (patch = {}) => {
  const { phase, actionsLeft, players: patchPlayers, map: patchMap, turn: patchTurn, ...rest } =
    patch;

  const state = {
    id: 'test-game',
    hook: PHASES.turn,
    round: 1,
    winner: null,
    turn: {
      index: 0,
      playerId: '0',
      actionsTotal: rules.actionsPerTurn,
      actionsLeft: rules.actionsPerTurn,
      bonus: { movement: 0, attack: 0, defense: 0, actions: 0 },
      actedRound: [],
    },
    combat: null,
    movement: null,
    handDiscard: null,
    effectPrompt: null,
    lastCombat: null,
    lastBonus: null,
    map: structuredClone(miniMap),
    settings: {},
    log: { battles: [], feed: [] },
    players: [
      {
        id: '0',
        name: 'Alpha',
        order: 1,
        placementReady: true,
        deck: zone([
          card({ id: 'deck_a', title: 'DeckA', bonus: 1 }),
          card({ id: 'deck_b', title: 'DeckB', bonus: 1 }),
        ]),
        hand: zone([
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
        ]),
        discard: zone([]),
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
        order: 2,
        placementReady: true,
        deck: zone([card({ id: 'deck_c', bonus: 1 })]),
        hand: zone([
          card({
            id: 'bdef',
            title: 'BDef',
            type: 'defense',
            value: 3,
            bonus: 1,
            fighter: 'beta',
          }),
        ]),
        discard: zone([]),
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
    ...rest,
  };

  if (patchPlayers) state.players = patchPlayers;
  if (patchMap) state.map = patchMap;
  if (patchTurn) state.turn = { ...state.turn, ...patchTurn };
  if (phase != null) state.hook = phase;
  if (actionsLeft != null) {
    state.turn = { ...state.turn, actionsLeft };
  }

  return structuredClone(state);
};

export const player = (state, id = '0') =>
  state.players.find(p => String(p.id) === String(id));

export { card, fighter, PHASES };
