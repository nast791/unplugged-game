import { getCardEngine } from '@nast791/cards/server';
import { continueCombatAfterResume } from '#shared/events/index.js';

/**
 * Вход в любую фазу → cards.dispatch (triggers сверяются с state.phase).
 * Хост не знает имён фаз и типов pause.
 */
export const onPhase = (state, api) =>
  getCardEngine().dispatch(state, { api });

/** Engine lifecycle aliases — одна и та же проверка по фазе. */
export const onGameStart = onPhase;
export const onTurnStart = onPhase;
export const onTurnEnd = onPhase;
export const onGameEnd = onPhase;

/**
 * RESOLVE_EFFECT — ответ на effectPrompt.
 * { answer } | { targetId }
 * Если пауза была внутри пайплайна боя — продолжаем combatFlow.
 */
export const resolveEffect = (state, action, api) => {
  const cards = getCardEngine();
  let next = cards.resume(state, action, { api });
  next = continueCombatAfterResume(next, { api, cards });
  return next;
};

export default resolveEffect;
