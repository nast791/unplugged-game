import { queryFighters } from '#shared/facts/fighters.js';
import { resolveVar } from '#shared/facts/vars.js';

/**
 * HIGHLIGHT_TARGETS — подсветка целей. Pause: wait → effectPrompt (cards).
 * params: { target: '$candidates' | filter }
 */
export const HIGHLIGHT_TARGETS = (ctx, payload = {}) => {
  const state = ctx.state;
  const playerId = ctx.player?.id ?? state?.turn?.playerId;
  const vars = ctx.vars && typeof ctx.vars === 'object' ? ctx.vars : {};
  const params = payload.params ?? {};

  let candidates = [];
  const targetRef = params.target ?? payload.target;
  if (targetRef != null) {
    const resolved = resolveVar(targetRef, vars);
    if (Array.isArray(resolved)) {
      candidates = resolved;
    } else if (resolved && typeof resolved === 'object') {
      candidates = queryFighters(state, resolved, { ownerPlayerId: playerId });
    }
  }
  if (!candidates.length) {
    candidates = queryFighters(state, params, { ownerPlayerId: playerId });
  }

  if (!candidates.length) {
    return ctx;
  }

  return {
    ...ctx,
    wait: {
      kind: 'HIGHLIGHT_TARGETS',
      type: 'HIGHLIGHT_TARGETS',
      message: payload.message ?? 'Выберите цель',
      candidates,
      count: Number(payload.count) || 1,
    },
  };
};

export default HIGHLIGHT_TARGETS;
