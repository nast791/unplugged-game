import { CELLS } from './cells.js';
import { CARDS } from './cards.js';
import { COMBAT } from './combat.js';
import { DEATH } from './death.js';
import { FIGHTERS } from './fighters.js';
import { ITEMS } from './items.js';
import { LOST } from './lost.js';
import { ALIVE_SIDES, NEXT_PLAYER, PLAYERS } from './players.js';
import { REVEALED } from './revealed.js';
import {
  ACTIVE_PLAYER,
  AP,
  DECK,
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
  DECK,
  HAND_OVER_LIMIT,
  FIGHTERS,
  COMBAT,
  CELLS,
  CARDS,
  DEATH,
  LOST,
  ITEMS,
  REVEALED,
};
