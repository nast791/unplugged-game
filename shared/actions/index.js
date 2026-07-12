/**
 * Точка входа для engine: tabletopEngine.actions.
 * onPhase / beforeEnterTurnEnd — lifecycle.
 * Эффекты — @nast791/cards (dispatch / resume).
 */
import { ACTION_TYPES } from '@nast791/engine/constants';
import { attack } from './attack.js';
import { defend } from './defend.js';
import { move } from './move.js';
import { place } from './place.js';
import { playCard } from './playCard.js';
import {
  onGameEnd,
  onGameStart,
  onPhase,
  onTurnEnd,
  onTurnStart,
  resolveEffect,
} from './resolveEffect.js';
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
  DISCARD_CARDS: 'DISCARD_CARDS',
  RESOLVE_EFFECT: 'RESOLVE_EFFECT',
  END_TURN: ACTION_TYPES.END_TURN,
};

export const beforeEnterTurnEnd = (state, api) =>
  CHECK_HAND_LIMIT(state, {}, api);

export {
  onPhase,
  onGameStart,
  onTurnStart,
  onTurnEnd,
  onGameEnd,
  resolveEffect,
} from './resolveEffect.js';

export { place } from './place.js';
export { move } from './move.js';
export { attack } from './attack.js';
export { defend } from './defend.js';
export { playCard } from './playCard.js';
export { DISCARD_CARDS, END_TURN };

export default {
  [HOST_ACTION_TYPES.PLACE]: place,
  [HOST_ACTION_TYPES.MOVE]: move,
  [HOST_ACTION_TYPES.ATTACK]: attack,
  [HOST_ACTION_TYPES.DEFEND]: defend,
  [HOST_ACTION_TYPES.PLAY_CARD]: playCard,
  [HOST_ACTION_TYPES.DISCARD_CARDS]: DISCARD_CARDS,
  [HOST_ACTION_TYPES.RESOLVE_EFFECT]: resolveEffect,
  [HOST_ACTION_TYPES.END_TURN]: END_TURN,
  beforeEnterTurnEnd,
  onPhase,
  onGameStart,
  onTurnStart,
  onTurnEnd,
  onGameEnd,
};
