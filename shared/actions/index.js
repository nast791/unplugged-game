/**
 * Реестр handlers для apply / gameEngine.
 */
import { attack } from './attack.js';
import { defend } from './defend.js';
import { move } from './move.js';
import { place } from './place.js';
import { playCard } from './playCard.js';
import { resign } from './resign.js';
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

export const ACTION_TYPES = {
  PLACE: 'PLACE',
  MOVE: 'MOVE',
  ATTACK: 'ATTACK',
  DEFEND: 'DEFEND',
  PLAY_CARD: 'PLAY_CARD',
  DISCARD_CARDS: 'DISCARD_CARDS',
  RESOLVE_EFFECT: 'RESOLVE_EFFECT',
  END_TURN: 'END_TURN',
  RESIGN: 'RESIGN',
};

/** @deprecated alias для UI */
export const HOST_ACTION_TYPES = ACTION_TYPES;

export const gameHandlers = {
  [ACTION_TYPES.PLACE]: place,
  [ACTION_TYPES.MOVE]: move,
  [ACTION_TYPES.ATTACK]: attack,
  [ACTION_TYPES.DEFEND]: defend,
  [ACTION_TYPES.PLAY_CARD]: playCard,
  [ACTION_TYPES.DISCARD_CARDS]: DISCARD_CARDS,
  [ACTION_TYPES.RESOLVE_EFFECT]: resolveEffect,
  [ACTION_TYPES.END_TURN]: END_TURN,
  [ACTION_TYPES.RESIGN]: resign,
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
  place,
  move,
  attack,
  defend,
  playCard,
  DISCARD_CARDS,
  END_TURN,
  resign,
};

export default {
  ...gameHandlers,
  beforeEnterTurnEnd,
  onPhase,
  onGameStart,
  onTurnStart,
  onTurnEnd,
  onGameEnd,
};
