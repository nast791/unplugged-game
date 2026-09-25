import { facts } from '#shared/facts-new/registry.js';
import { findPlayer } from '#shared/helpers/base.js';
import { resolveVars } from '#shared/helpers/vars.js';

/** Контекст факта: state, hook как phase, игрок и vars. Модуль не знает ни одного имени хука/фазы. */
const buildFactContext = (partyState, context = {}) => {
  const playerId =
    context.playerId ?? context.player?.id ?? partyState.turn?.playerId;
  const player =
    context.player ??
    (playerId != null ? findPlayer(partyState, playerId) : null);

  return {
    ...context,
    state: partyState,
    phase: partyState.hook,
    player,
    vars: { ...(context.vars ?? {}) },
  };
};

/** Один fact из реестра facts-new/registry.js. */
export const runFact = (partyState, factName, params = {}, context = {}) => {
  const fn = facts[factName];
  if (typeof fn !== 'function') {
    throw new Error(`fact "${factName}" не найден`);
  }
  return fn(buildFactContext(partyState, context), params);
};

/**
 * Цепочка facts (AND); trigger.var пишет value в vars.
 * `min` можно писать и на уровне триггера (как в legacy-контенте), и внутри params — факт читает его из params.
 * В params подставляются $переменные от предыдущих условий: так читается «рука того самого врага»
 * (`HAND { of: '$enemy' }`), где переменная появилась в условии выше.
 */
export const runFacts = (partyState, triggers, context = {}) => {
  const vars = { ...(context.vars ?? {}) };
  for (const trigger of triggers ?? []) {
    const params = resolveVars({ ...(trigger.params ?? {}) }, vars);
    if (trigger.min != null && params.min == null) params.min = trigger.min;

    const { ok, value } = runFact(partyState, trigger.fact, params, {
      ...context,
      vars,
    });
    if (!ok) return { ok: false, vars };
    if (trigger.var) vars[trigger.var] = value;
  }
  return { ok: true, vars };
};

/**
 * Условия правила: `when` — цепочка AND, `any` — «или» из веток (каждая ветка тоже AND).
 * Срабатывает первая подошедшая ветка, и её переменные доступны дальше (в then) — ветки
 * упорядочивают по приоритету. Нет `any` — работает только `when`, как раньше.
 */
export const runConditions = (partyState, { when, any } = {}, context = {}) => {
  const base = runFacts(partyState, when ?? [], context);
  if (!base.ok) return { ok: false, vars: base.vars };
  if (!Array.isArray(any) || any.length === 0) return base;

  for (const branch of any) {
    const result = runFacts(partyState, branch ?? [], {
      ...context,
      vars: { ...base.vars },
    });
    if (result.ok) return { ok: true, vars: result.vars };
  }

  return { ok: false, vars: base.vars };
};
