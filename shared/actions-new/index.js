export { PLACE_FIGHTER } from './placeFighter.js';
export { commonMoves, UI_OK, UI_BACK } from './moves.js';
export { SET_ACTIONS } from './base.js';
export { SET_CARDS } from './cards.js';
export { SET_HEALTH } from './health.js';
export { SET_FIGHTER_CELL } from './fighter.js';
export { SET_MOVEMENT } from './movement.js';
export { SET_COMBAT } from './combat.js';
export { SET_TARGETING } from './targeting.js';

import { SET_ACTIONS } from './base.js';
import { SET_CARDS } from './cards.js';
import { SET_COMBAT } from './combat.js';
import { SET_FIGHTER_CELL } from './fighter.js';
import { SET_HEALTH } from './health.js';
import { SET_MOVEMENT } from './movement.js';
import { SET_TARGETING } from './targeting.js';
import { PLACE_FIGHTER } from './placeFighter.js';

/** Универсальные actions (CAPS) — манипуляторы доменами; вызываются из фаз и из phase.moves. */
export const actions = {
  PLACE_FIGHTER,
  SET_FIGHTER_CELL,
  SET_ACTIONS,
  SET_CARDS,
  SET_HEALTH,
  SET_MOVEMENT,
  SET_COMBAT,
  SET_TARGETING,
};
