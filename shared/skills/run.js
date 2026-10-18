import { findPlayer } from '#shared/helpers/base.js';
import { closeTargetingWindow, pickAutoCandidates } from '#shared/helpers/targeting.js';
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
    // отметка «умение сработало»: по ней карточка героя показывает плашку «Умение»
    skill: skill.id,
    // окно без выбора закрываем сами: отмечаем кандидатов и разыгрываем момент picked.
    // `auto` срабатывает, только когда набор безальтернативный (`pickAutoCandidates`): у окна-
    // переключателя с несколькими кандидатами окно остаётся игроку, и применяет его общая кнопка
    autoPick: (state, ownerId) => {
      const picked = pickAutoCandidates(state, ownerId);
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
