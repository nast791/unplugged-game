import { findPlayer } from '#shared/helpers/base.js';
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
  });
};
