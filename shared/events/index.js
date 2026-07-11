/**
 * Внутренние events — не публичный sendAction.
 * Контракт: (state, payload?, ctx?) => state
 * Карта type=effect несёт `events: [{ type, ...payload }]`.
 */
import { CHECK_WINNER } from './checkWinner.js';
import { DEAL_DAMAGE } from './dealDamage.js';
import { DRAW_CARDS } from './drawCards.js';
import { SPEND_AP } from './spendAp.js';
import { CHECK_HAND_LIMIT } from './checkHandLimit.js';
import { DISCARD_CARDS } from './discardCards.js';
import { END_TURN } from './endTurn.js';
import { EXHAUSTION } from './exhaustion.js';
import { RESOLVE_COMBAT } from './resolveCombat.js';
import { STANDSTILL } from './standstill.js';

export const EVENTS = {
  DRAW_CARDS,
  DEAL_DAMAGE,
  CHECK_WINNER,
  SPEND_AP,
  CHECK_HAND_LIMIT,
  DISCARD_CARDS,
  END_TURN,
  EXHAUSTION,
  RESOLVE_COMBAT,
  STANDSTILL,
};

/** Прогнать шаги с карты / из handler. */
export const runEvents = (state, steps, ctx = {}) => {
  let next = state;
  for (const step of steps ?? []) {
    const { type, ...payload } = step;
    const fn = EVENTS[type];
    if (typeof fn !== 'function') {
      throw new Error(`events: неизвестный type "${type}"`);
    }
    next = fn(next, payload, ctx);
  }
  return next;
};

export { DRAW_CARDS } from './drawCards.js';
export { DEAL_DAMAGE } from './dealDamage.js';
export { CHECK_WINNER } from './checkWinner.js';
export { SPEND_AP } from './spendAp.js';
export { CHECK_HAND_LIMIT } from './checkHandLimit.js';
export { DISCARD_CARDS } from './discardCards.js';
export { END_TURN } from './endTurn.js';
export { EXHAUSTION } from './exhaustion.js';
export { RESOLVE_COMBAT } from './resolveCombat.js';
export { STANDSTILL } from './standstill.js';
