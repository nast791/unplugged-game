import { findPlayer } from '#shared/helpers/base.js';

/** Активная фаза игрока: первая, у которой условие active выполнено. */
export const activePhaseOf = (hookPhases, partyState, playerId) =>
  (hookPhases ?? []).find(entry => entry.active?.(partyState, playerId)) ?? null;

/**
 * enter/exit активной фазы игрока. Фазы берём у самого хука (он их и объявляет), exit ищем по имени
 * среди них же: хуки снимают _activePhase на выходе, поэтому «хвостов» фаз из других хуков не бывает.
 * Модуль не знает ни об одном конкретном хуке или фазе — только контракт.
 */
export const runPhase = (partyState, hookPhases, playerId) => {
  const player = findPlayer(partyState, playerId);
  if (!player) return partyState;

  const phases = hookPhases ?? [];
  const phase = activePhaseOf(phases, partyState, playerId);
  const prevName = player._activePhase ?? null;
  const nextName = phase?.name ?? null;
  let state = partyState;

  if (prevName !== nextName) {
    if (prevName) {
      const prevPhase = phases.find(entry => entry.name === prevName) ?? null;
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
