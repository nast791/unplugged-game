/**
 * PHASE — текущая фаза партии (state.phase) совпадает с params.id.
 * Фазу в контент не хардкодят в хосте: сверяется факт с state.phase.
 */
export const PHASE = (ctx, params = {}) => {
  const id = params.id ?? params.phase;
  if (id == null) {
    throw new Error('fact PHASE: нужен params.id');
  }
  const phase = ctx.phase ?? ctx.state?.phase ?? ctx.moment;
  return {
    ok: String(phase) === String(id),
    value: phase,
  };
};

/** @deprecated используйте PHASE */
export const MOMENT = PHASE;

export default PHASE;
