/**
 * PHASE — ctx.phase (или state.phase) совпадает с params.id.
 * Для боя cards.dispatch передаёт phase override (after_combat и т.п.).
 */
export const PHASE = (ctx, params = {}) => {
  const id = params.id ?? params.phase;
  if (id == null) {
    throw new Error('fact PHASE: нужен params.id');
  }
  const phase = ctx.phase ?? ctx.state?.hook ?? ctx.moment;
  return {
    ok: String(phase) === String(id),
    value: phase,
  };
};

/** @deprecated используйте PHASE */
export const MOMENT = PHASE;

export default PHASE;
