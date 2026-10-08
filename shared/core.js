/**
 * Универсальный движок игры: хуки → фазы → действия.
 * Конкретика: lifecycle/registry.js, phases/*, actions/*.
 *
 * Дверь наружу — `shared/publicApi.js` (проверки контракта действия и ре-экспорт поверхности);
 * отсюда напрямую берут то, что фасад не меняет: `runUi`, `runFact(s)` (клиент, сервер, тесты)
 * и сам движок в тестах его внутренностей (`tests/unit/core/*`).
 */
import { lifecycle } from '#shared/constants/hooks.js';
import { commonMoves } from '#shared/actions/moves.js';
import { runFact, runFacts } from '#shared/facts/run.js';
import { findPlayer, resolvePhaseHint } from '#shared/helpers/base.js';
import { forkState } from '#shared/helpers/fork.js';
import { syncAllShardItems } from '#shared/helpers/shards.js';
import { lifecycleHooks } from '#shared/lifecycle/registry.js';
import { activePhaseOf, runPhase as runHookPhase } from '#shared/phases/run.js';

export { isCoreHook } from '#shared/lifecycle/registry.js';
export { runFact, runFacts };

const sortedLifecycle = [...lifecycle].sort((left, right) => left.order - right.order);

export const nextInLifecycle = currentHookName => {
  const index = sortedLifecycle.findIndex(entry => entry.name === currentHookName);
  if (index < 0 || index >= sortedLifecycle.length - 1) return null;
  return sortedLifecycle[index + 1].name;
};

/** enter/exit активной фазы игрока; фазы объявляет сам хук (lifecycleHooks[hook].phases). */
export const runPhase = (partyState, playerId) =>
  runHookPhase(partyState, lifecycleHooks[partyState.hook]?.phases ?? [], playerId);

/** Запас шагов: из-за перенаправлений enter цепочка может идти дольше самой длины lifecycle. */
const MAX_LIFECYCLE_STEPS = sortedLifecycle.length * 2;

export const runLifecycle = partyState => {
  let state = partyState;

  for (let step = 0; step < MAX_LIFECYCLE_STEPS; step += 1) {
    const hookName = state.hook;
    const currentHook = lifecycleHooks[hookName];
    if (!currentHook) return state;

    state = currentHook.enter?.(state) ?? state;

    /** enter может увести партию в другой хук (например, в gameEnd) — идём туда. */
    if (state.hook !== hookName) continue;

    const hookBodyComplete = currentHook.body?.(state) ?? false;
    if (!hookBodyComplete) return state;

    state = currentHook.exit?.(state) ?? state;

    const nextHookName = currentHook.next ?? nextInLifecycle(hookName);
    if (!nextHookName) return state;

    state = { ...state, hook: nextHookName };
  }

  throw new Error(`runLifecycle: цепочка хуков не завершилась за ${MAX_LIFECYCLE_STEPS} шагов`);
};

/** UI-проекция: не пишется в state. Конкретика — в phase.ui(). */
export const runUi = (partyState, playerId, clientContext = {}) => {
  const hookPhases = lifecycleHooks[partyState.hook]?.phases ?? [];
  const phase = activePhaseOf(hookPhases, partyState, playerId);
  const phaseUi = phase?.ui?.(partyState, playerId, clientContext, phase) ?? {};

  return {
    phase: phase?.name ?? null,
    ...phaseUi,
    hint: phaseUi.hint ?? resolvePhaseHint(phase?.hints, partyState, playerId, clientContext),
  };
};

export const runAction = (partyState, action) => {
  if (!action?.type) throw new Error('action.type обязателен');

  const currentHook = lifecycleHooks[partyState.hook];
  if (!currentHook) {
    throw new Error(`hook "${partyState.hook}" не обслуживается core`);
  }

  if (!partyState.players.some(player => String(player.id) === String(action.playerId))) {
    throw new Error(`action.playerId "${action.playerId}" нет в партии`);
  }

  const hookPhases = lifecycleHooks[partyState.hook]?.phases ?? [];
  const phase = activePhaseOf(hookPhases, partyState, action.playerId);

  const commonMove = commonMoves[action.type];
  const phaseMove = phase?.moves?.[action.type];
  const moveHandler = commonMove ? (state, act) => commonMove(state, act, phase) : phaseMove;

  if (!moveHandler) {
    throw new Error(`move "${action.type}" недоступен в фазе "${phase?.name ?? '—'}"`);
  }

  // Ход считается на форке: кирпичи правят вложенные объекты на месте, а входное состояние
  // обязано остаться прежним (`shared/helpers/fork.js`, инвариант — `tests/unit/core/immutability.test.js`)
  let state = moveHandler(forkState(partyState), action);
  state = runPhase(state, action.playerId);
  state = runLifecycle(state);
  // табло осколков (предмет `shard`) — зеркало сброса: обновляем на выходе действия, чтобы панель
  // показывала то же, что видят правила (`shared/helpers/shards.js`)
  return syncAllShardItems(state);
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
