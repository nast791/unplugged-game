import {
  runAction as runCoreAction,
  runLifecycle as runCoreLifecycle,
} from '#shared/core.js';

export { runUi } from '#shared/core.js';

/**
 * Мост клиента к core. Ход, расстановка и конец хода мигрированы, поэтому здесь остались
 * только переходы для старых обработчиков движка карт (@nast791/cards) — эффекты ещё не
 * переписаны на беспромптовую модель.
 */
export const enterTurnEnd = state => ({ ...state, hook: 'turnEnd' });

export const enterGameEnd = (state, winner) => ({
  ...state,
  hook: 'gameEnd',
  winner: winner === undefined ? state.winner : winner,
  turn: { ...state.turn, actionsLeft: 0 },
});

/** api для эффектов карт: завершение хода (с проверкой руки) и завершение партии. */
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

/** Точка входа клиента: действие обслуживает core по активной фазе игрока. */
export const runAction = (state, action) => {
  if (!action?.type) throw new Error('action.type обязателен');
  if (state.hook === 'gameEnd') throw new Error('партия завершена');
  return runCoreAction(state, action);
};

/** Прогон lifecycle из core: конкретика — в shared/lifecycle/registry.js. */
export const runLifecycle = state => runCoreLifecycle(state);

export default {
  runAction,
  runLifecycle,
  createPartyApi,
  enterTurnEnd,
  enterGameEnd,
};
