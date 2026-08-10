/**
 * Универсальный движок игры.
 * Конкретика: lifecycle/registry.js, phases/registry.js, actions-new/*.
 *
 * Публичный API: runLifecycle, runAction, runPhase, runUi, runFact, runFacts.
 */
import { lifecycle } from '#shared/constants/hooks.js';
import { commonMoves } from '#shared/actions-new/moves.js';
import { facts } from '#shared/facts-new/registry.js';
import { findPlayer, resolvePhaseHint } from '#shared/helpers/base.js';
import { lifecycleHooks } from '#shared/lifecycle/registry.js';
import { phases } from '#shared/phases/registry.js';

export { isCoreHook } from '#shared/lifecycle/registry.js';

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

/** Цепочка facts (AND); trigger.var пишет value в vars. */
export const runFacts = (partyState, triggers, context = {}) => {
  const vars = { ...(context.vars ?? {}) };
  for (const trigger of triggers ?? []) {
    const { ok, value } = runFact(
      partyState,
      trigger.fact,
      trigger.params ?? {},
      { ...context, vars },
    );
    if (!ok) return { ok: false, vars };
    if (trigger.var) vars[trigger.var] = value;
  }
  return { ok: true, vars };
};

const sortedLifecycle = [...lifecycle].sort(
  (left, right) => left.order - right.order,
);

export const nextInLifecycle = currentHookName => {
  const index = sortedLifecycle.findIndex(entry => entry.name === currentHookName);
  if (index < 0 || index >= sortedLifecycle.length - 1) return null;
  return sortedLifecycle[index + 1].name;
};

export const runPhase = (partyState, playerId) => {
  const player = findPlayer(partyState, playerId);
  if (!player) return partyState;

  const hookPhases = lifecycleHooks[partyState.hook]?.phases ?? [];
  const phase =
    hookPhases.find(entry => entry.active?.(partyState, playerId)) ?? null;

  const prevName = player._activePhase ?? null;
  const nextName = phase?.name ?? null;
  let state = partyState;

  if (prevName !== nextName) {
    if (prevName) {
      const prevPhase = phases[prevName];
      state = prevPhase?.exit?.(state, playerId) ?? state;
    }
    player._activePhase = nextName;
    if (nextName && phase.enter) {
      state = phase.enter(state, playerId) ?? state;
    }
  }

  if (nextName && phase.body) {
    state = phase.body(state, playerId) ?? state;
  }

  return state;
};

export const runLifecycle = partyState => {
  let state = partyState;

  for (let step = 0; step < sortedLifecycle.length; step += 1) {
    const hookName = state.hook;
    const currentHook = lifecycleHooks[hookName];
    if (!currentHook) break;

    state = currentHook.enter?.(state) ?? state;

    const hookBodyComplete = currentHook.body?.(state) ?? false;
    if (!hookBodyComplete) break;

    state = currentHook.exit?.(state) ?? state;

    const nextHookName = nextInLifecycle(hookName);
    if (!nextHookName) break;

    state = { ...state, hook: nextHookName };
  }

  return state;
};

/** UI-проекция: не пишется в state. Конкретика — в phase.ui(). */
export const runUi = (partyState, playerId, clientContext = {}) => {
  const hookPhases = lifecycleHooks[partyState.hook]?.phases ?? [];
  const phase =
    hookPhases.find(entry => entry.active?.(partyState, playerId)) ?? null;
  const phaseUi =
    phase?.ui?.(partyState, playerId, clientContext, phase) ?? {};

  return {
    phase: phase?.name ?? null,
    ...phaseUi,
    hint:
      phaseUi.hint ??
      resolvePhaseHint(phase?.hints, partyState, playerId, clientContext),
  };
};

export const runAction = (partyState, action) => {
  if (!action?.type) throw new Error('action.type обязателен');

  const currentHook = lifecycleHooks[partyState.hook];
  if (!currentHook) {
    throw new Error(`hook "${partyState.hook}" не обслуживается core`);
  }

  if (
    !partyState.players.some(player => String(player.id) === String(action.playerId))
  ) {
    throw new Error(`action.playerId "${action.playerId}" нет в партии`);
  }

  const hookPhases = lifecycleHooks[partyState.hook]?.phases ?? [];
  const phase =
    hookPhases.find(entry => entry.active?.(partyState, action.playerId)) ?? null;

  const commonMove = commonMoves[action.type];
  const phaseMove = phase?.moves?.[action.type];
  const moveHandler = commonMove
    ? (state, act) => commonMove(state, act, phase)
    : phaseMove;

  if (!moveHandler) {
    throw new Error(
      `move "${action.type}" недоступен в фазе "${phase?.name ?? '—'}"`,
    );
  }

  let state = moveHandler(partyState, action);
  state = runPhase(state, action.playerId);
  state = runLifecycle(state);
  return state;
};

export default {
  runLifecycle,
  runAction,
  runPhase,
  runUi,
  runFact,
  runFacts,
  nextInLifecycle,
};
