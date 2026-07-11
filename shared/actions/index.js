/**
 * Точка входа для engine: tabletopEngine.actions.
 * Публичные намерения игрока. Внутренние events — shared/events/.
 * beforeEnterTurnEnd — lifecycle (не action.type).
 * Host перекрывает kernel при совпадении type (например END_TURN).
 */
import { ACTION_TYPES } from '@nast791/engine/constants';
import { attack } from './attack.js';
import { defend } from './defend.js';
import { move } from './move.js';
import { place } from './place.js';
import { playCard } from './playCard.js';
import {
  CHECK_HAND_LIMIT,
  DISCARD_CARDS,
  END_TURN,
} from '#shared/events/index.js';

export const HOST_ACTION_TYPES = {
  PLACE: 'PLACE',
  MOVE: 'MOVE',
  ATTACK: 'ATTACK',
  DEFEND: 'DEFEND',
  PLAY_CARD: 'PLAY_CARD',
  DISCARD: 'DISCARD',
  END_TURN: ACTION_TYPES.END_TURN,
};

/** Перед turnEnd: лимит руки → handDiscard или enterTurnEnd. */
export const beforeEnterTurnEnd = (state, api) =>
  CHECK_HAND_LIMIT(state, {}, api);

/** DISCARD — intent → events/DISCARD_CARDS. */
export const discard = (state, action, api) =>
  DISCARD_CARDS(
    state,
    {
      playerId: action.playerId,
      cardId: action.cardId,
      cardIds: action.cardIds,
    },
    { api },
  );

/** END_TURN — intent → events/END_TURN (STANDSTILL / hand limit). */
export const endTurn = (state, action, api) =>
  END_TURN(state, { playerId: action.playerId }, { api });

export { place } from './place.js';
export { move } from './move.js';
export { attack } from './attack.js';
export { defend } from './defend.js';
export { playCard } from './playCard.js';

export default {
  [HOST_ACTION_TYPES.PLACE]: place,
  [HOST_ACTION_TYPES.MOVE]: move,
  [HOST_ACTION_TYPES.ATTACK]: attack,
  [HOST_ACTION_TYPES.DEFEND]: defend,
  [HOST_ACTION_TYPES.PLAY_CARD]: playCard,
  [HOST_ACTION_TYPES.DISCARD]: discard,
  [HOST_ACTION_TYPES.END_TURN]: endTurn,
  beforeEnterTurnEnd,
};
