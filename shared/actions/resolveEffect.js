import { getCardEngine } from '@nast791/cards/server';

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
 */
export const resolveEffect = (state, action, api) =>
  getCardEngine().resume(state, action, { api });

export default resolveEffect;
