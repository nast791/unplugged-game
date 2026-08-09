import { getCardEngine } from '@nast791/cards/server';
import { continueCombatAfterResume } from '#shared/events/index.js';

const skillSources = state => {
  const player = (state.players ?? []).find(
    p => String(p.id) === String(state.turn?.playerId),
  );
  if (!player?.skill) return [];
  return [{ doc: player.skill, player, kind: 'skill' }];
};

/**
 * Вход в hook → cards.dispatch (triggers сверяются с phase = state.hook).
 */
export const onPhase = (state, api) =>
  getCardEngine().dispatch(state, {
    api,
    phase: state.hook,
    sources: skillSources(state),
  });

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
