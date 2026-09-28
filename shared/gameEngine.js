import { runAction as runCoreAction, runLifecycle as runCoreLifecycle } from '#shared/core.js';

export { runUi } from '#shared/core.js';

/**
 * Точка входа клиента и сервера: действие обслуживает core по активной фазе игрока,
 * lifecycle идёт по shared/lifecycle/registry.js. Легаси-мост движка карт удалён вместе
 * с самим движком: все эффекты описаны правилами (`card.rules`).
 */
export const runAction = (state, action) => {
  if (!action?.type) throw new Error('action.type обязателен');
  if (state.hook === 'gameEnd') throw new Error('партия завершена');
  return runCoreAction(state, action);
};

export const runLifecycle = state => runCoreLifecycle(state);

export default { runAction, runLifecycle };
