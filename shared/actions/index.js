/**
 * Обработчики фаз партии для движка карт (@nast791/cards).
 * Ход и расстановка мигрированы: shared/lifecycle + shared/phases + shared/actions-new.
 * Эти входы (onPhase и родственные) будут переподключены, когда эффекты карт перепишут
 * на беспромптовую модель.
 */
import {
  onGameEnd,
  onGameStart,
  onPhase,
  onTurnEnd,
  onTurnStart,
  resolveEffect,
} from './resolveEffect.js';

export { onGameEnd, onGameStart, onPhase, onTurnEnd, onTurnStart, resolveEffect };

export default {
  onGameEnd,
  onGameStart,
  onPhase,
  onTurnEnd,
  onTurnStart,
  resolveEffect,
};
