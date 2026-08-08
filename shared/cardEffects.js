/**
 * Реестр эффектов + фактов для @nast791/cards.
 * Адаптер: events (state, payload, ctx) → (ctx, payload) => ctx
 * Интерактив: pause + wait (effectPrompt пишет cards).
 */
import {
  APPLY_BONUS,
  CHECK_HAND_LIMIT,
  CHECK_WINNER,
  DEAL_DAMAGE,
  DISCARD_CARDS,
  DRAW_CARDS,
  END_TURN,
  EXHAUSTION,
  HIGHLIGHT_TARGETS,
  PROMPT,
  RESOLVE_COMBAT,
  SPEND_AP,
  STANDSTILL,
} from '#shared/events/index.js';
import { PHASE, MOMENT } from '#shared/facts/moment.js';
import { FIGHTERS } from '#shared/facts/fighters.js';
import { ANSWER } from '#shared/facts/answer.js';
import { COMBAT } from '#shared/facts/combat.js';

const wrap =
  fn =>
  (ctx, payload = {}) => {
    const state = fn(ctx.state, payload, ctx);
    return { ...ctx, state };
  };

const interactive =
  fn =>
  (ctx, payload = {}) => {
    const result = fn(ctx, payload);
    if (result?.wait) {
      return { ...result, pause: true };
    }
    return result ?? ctx;
  };

export const effects = {
  DRAW_CARDS: wrap(DRAW_CARDS),
  DEAL_DAMAGE: wrap(DEAL_DAMAGE),
  PROMPT: interactive(PROMPT),
  HIGHLIGHT_TARGETS: interactive(HIGHLIGHT_TARGETS),
  CHECK_WINNER: wrap(CHECK_WINNER),
  SPEND_AP: wrap(SPEND_AP),
  CHECK_HAND_LIMIT: wrap(CHECK_HAND_LIMIT),
  DISCARD_CARDS: wrap(DISCARD_CARDS),
  END_TURN: wrap(END_TURN),
  EXHAUSTION: wrap(EXHAUSTION),
  RESOLVE_COMBAT: wrap(RESOLVE_COMBAT),
  STANDSTILL: wrap(STANDSTILL),
  APPLY_BONUS: wrap(APPLY_BONUS),
};

export const facts = {
  PHASE,
  MOMENT,
  FIGHTERS,
  ANSWER,
  COMBAT,
};

export default { effects, facts };
