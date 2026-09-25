import { COMBAT } from './combat.js';
import { FIGHTERS } from './fighters.js';
import { ALIVE_SIDES, NEXT_PLAYER, PLAYERS } from './players.js';
import {
  ACTIVE_PLAYER,
  AP,
  HAND,
  HAND_OVER_LIMIT,
  IN_PROGRESS,
  PICKED,
  TARGETING,
} from './turn.js';

/** Мигрированные facts для runFact / runFacts. Core знает только этот реестр. */
export const facts = {
  PLAYERS,
  NEXT_PLAYER,
  ALIVE_SIDES,
  ACTIVE_PLAYER,
  AP,
  IN_PROGRESS,
  TARGETING,
  PICKED,
  HAND,
  HAND_OVER_LIMIT,
  FIGHTERS,
  COMBAT,
};
