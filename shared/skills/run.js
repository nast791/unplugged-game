import { findPlayer } from '#shared/helpers/base.js';
import { closeTargetingWindow, pickSingleCandidate } from '#shared/helpers/targeting.js';
import { runRules } from '#shared/rules/run.js';

/**
 * Прогон правил способности героя в конкретном моменте.
 * Способность лежит в player.skill, её правила исполняет общий runRules.
 */
export const runSkillMoment = (partyState, playerId, moment) => {
  const player = findPlayer(partyState, playerId);
  const skill = player?.skill;
  if (!skill) return partyState;
  if (skill.type !== 'skill') {
    throw new Error(`skills: player.skill игрока ${playerId} без type: 'skill'`);
  }

  return runRules(partyState, skill.rules, moment, {
    playerId,
    source: skill.id,
    // окно с одним кандидатом закрываем сами: отмечаем цель и разыгрываем момент picked
    autoPick: (state, ownerId) => {
      const picked = pickSingleCandidate(state, ownerId);
      if (!picked) return state;

      const afterPicked = runRules(picked, skill.rules, 'picked', {
        playerId: ownerId,
        source: skill.id,
      });
      return closeTargetingWindow(afterPicked, ownerId);
    },
  });
};

export default runSkillMoment;
