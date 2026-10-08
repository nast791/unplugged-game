/**
 * Публичный API движка — единственная дверь для клиента, сервера, бота и тестов.
 * `shared/core.js` — внутренности (реестр хуков, фазы, действия, форк состояния), сюда его
 * поверхность вынесена целиком, чтобы по имени файла читался слой: отсюда ходят снаружи.
 *
 * Проверки контракта живут только здесь: `runAction` требует `action.type` и отказанную партию.
 * Остальное ре-экспортируется как есть: обёртка над `runLifecycle` ничего не проверяла, а отказ
 * при `hook === 'gameEnd'` сломал бы перезагрузку страницы на экране итогов — `useGameView.bootstrap`
 * гонит lifecycle на сохранённой партии, а она может быть уже закончена.
 */
import { runAction as runCoreAction } from '#shared/core.js';

export { runFact, runFacts, runLifecycle, runPhase, runUi } from '#shared/core.js';

export const runAction = (state, action) => {
  if (!action?.type) throw new Error('action.type обязателен');
  if (state.hook === 'gameEnd') throw new Error('партия завершена');
  return runCoreAction(state, action);
};
