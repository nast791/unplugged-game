/**
 * Legacy-движок (turn, combat, pending) + роутинг: gameStart → core, остальное → legacy.
 */
import hostActions, {
  beforeEnterTurnEnd,
  gameHandlers,
} from '#shared/actions/index.js';
import { rules } from '#shared/constants/rules.js';
import {
  isCoreHook,
  runAction as runCoreAction,
  runLifecycle as runCoreLifecycle,
} from '#shared/core.js';

export { runUi } from '#shared/core.js';

export const currentPlayerId = state => state.turn?.playerId;

export const nextPlayerId = state => {
  const ids = (state.players ?? []).map(p => String(p.id));
  const cur = String(state.turn?.playerId);
  const index = ids.indexOf(cur);
  if (index < 0) return ids[0];
  return ids[(index + 1) % ids.length];
};

export const enterTurnEnd = state => ({ ...state, hook: 'turnEnd' });

export const enterGameEnd = (state, winner) => ({
  ...state,
  hook: 'gameEnd',
  winner: winner === undefined ? state.winner : winner,
  turn: { ...state.turn, actionsLeft: 0 },
});

export const createPartyApi = ({ beforeEnterTurnEnd: beforeHook } = {}) => {
  const enterTurnEndRaw = state => enterTurnEnd(state);
  const enterGameEndRaw = (state, winner) => enterGameEnd(state, winner);

  const api = {
    enterTurnEnd: enterTurnEndRaw,
    enterGameEnd: enterGameEndRaw,
  };

  if (typeof beforeHook === 'function') {
    api.enterTurnEnd = state =>
      beforeHook(state, {
        ...api,
        enterTurnEnd: enterTurnEndRaw,
      });
  }
  return api;
};

const HOOK_LIFECYCLE = {
  turnStart: 'onTurnStart',
  turnEnd: 'onTurnEnd',
  gameEnd: 'onGameEnd',
};

const runLifecycleEnter = (name, state, api) => {
  const fn = hostActions[name] ?? hostActions.onPhase;
  return typeof fn === 'function' ? fn(state, api) : state;
};

const legacyStepHook = state => {
  switch (state.hook) {
    case 'gameStart':
      return state;
    case 'turnStart':
      return {
        ...state,
        hook: 'turn',
        movement: null,
        handDiscard: null,
        lastCombat: null,
        effectPrompt: null,
        turn: {
          ...state.turn,
          actionsLeft: state.turn?.actionsTotal ?? rules.actionsPerTurn,
        },
      };
    case 'turnEnd':
      if (state.winner != null) return enterGameEnd(state, state.winner);
      return {
        ...state,
        hook: 'turnStart',
        turn: {
          ...state.turn,
          index: (state.turn?.index ?? 0) + 1,
          playerId: nextPlayerId(state),
        },
      };
    default:
      return state;
  }
};

/** Legacy auto-advance: turnStart → turn, turnEnd → … (не gameStart — там core). */
export const advanceHooks = (state, runLifecycleFn) => {
  let next = state;
  for (let step = 0; step < 8; step += 1) {
    const before = next.hook;
    if (before === 'gameStart') break;

    const lifecycleName = HOOK_LIFECYCLE[before];
    if (lifecycleName && typeof runLifecycleFn === 'function') {
      next = runLifecycleFn(lifecycleName, next) ?? next;
    }
    next = legacyStepHook(next);
    if (next.hook === before) break;
  }
  return next;
};

const assertPlayer = (state, playerId) => {
  if (!state.players.some(p => String(p.id) === String(playerId))) {
    throw new Error(`action.playerId "${playerId}" нет в партии`);
  }
};

const assertTurn = (state, action) => {
  if (action.type === 'RESIGN') return;
  if (
    state.hook === 'turn' &&
    action.type === 'DEFEND' &&
    state.combat &&
    String(action.playerId) === String(state.combat.defenderPlayerId)
  ) {
    return;
  }
  if (
    state.hook === 'turn' &&
    action.type === 'DISCARD_CARDS' &&
    state.handDiscard &&
    String(action.playerId) === String(state.handDiscard.playerId)
  ) {
    return;
  }
  if (
    state.hook === 'turn' &&
    action.type === 'RESOLVE_EFFECT' &&
    state.effectPrompt &&
    String(action.playerId) === String(state.effectPrompt.playerId)
  ) {
    return;
  }
  if (String(action.playerId) !== String(currentPlayerId(state))) {
    throw new Error(
      `action.playerId "${action.playerId}" не совпадает с turn.playerId "${currentPlayerId(state)}"`,
    );
  }
};

const assertPending = (state, action) => {
  if (state.handDiscard && !['DISCARD_CARDS', 'RESIGN'].includes(action.type)) {
    throw new Error('сначала сбросьте лишние карты (DISCARD_CARDS)');
  }
  if (state.combat && !['DEFEND', 'RESIGN'].includes(action.type)) {
    throw new Error('сначала завершите бой (DEFEND)');
  }
  if (state.effectPrompt && !['RESOLVE_EFFECT', 'RESIGN'].includes(action.type)) {
    throw new Error('сначала ответьте на эффект (RESOLVE_EFFECT)');
  }
  if (state.movement && !['MOVE', 'RESIGN'].includes(action.type)) {
    throw new Error('сначала завершите перемещение (MOVE confirm)');
  }
};

const runLegacyAction = (state, action) => {
  const handler = gameHandlers[action.type];
  if (!handler) {
    throw new Error(`неизвестный action.type "${action.type}"`);
  }

  assertTurn(state, action);
  assertPending(state, action);

  const api = createPartyApi({ beforeEnterTurnEnd });
  let next = handler(state, action, api);
  next = advanceHooks(next, (name, partyState) =>
    runLifecycleEnter(name, partyState, api),
  );
  return next;
};

/** gameStart → core; иначе legacy; после выхода из gameStart — legacy advance. */
export const runAction = (state, action) => {
  if (!action?.type) throw new Error('action.type обязателен');
  if (state.hook === 'gameEnd') {
    throw new Error('партия завершена');
  }

  assertPlayer(state, action.playerId);

  if (isCoreHook(state.hook)) {
    let next = runCoreAction(state, action);
    if (!isCoreHook(next.hook)) {
      next = advanceHooks(next, (name, partyState) =>
        runLifecycleEnter(name, partyState, createPartyApi({ beforeEnterTurnEnd })),
      );
    }
    return next;
  }

  return runLegacyAction(state, action);
};

/** Core enter для gameStart; legacy advance для остальных хуков. */
export const runLifecycle = state => {
  let next = runCoreLifecycle(state);
  if (!isCoreHook(next.hook)) {
    next = advanceHooks(next, (name, partyState) =>
      runLifecycleEnter(name, partyState, createPartyApi({ beforeEnterTurnEnd })),
    );
  }
  return next;
};

export default {
  runAction,
  runLifecycle,
  advanceHooks,
  createPartyApi,
  currentPlayerId,
  nextPlayerId,
  enterTurnEnd,
  enterGameEnd,
};
