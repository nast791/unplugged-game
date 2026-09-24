import { actions } from '#shared/actions-new/index.js';
import { isMoment } from '#shared/constants/moments.js';
import { runConditions } from '#shared/facts-new/run.js';
import { findPlayer } from '#shared/helpers/base.js';
import { endGameIfFinished } from '#shared/helpers/turn.js';

/** Подставить $переменные (значения из conditions/var и extraVars) в параметры действия. */
const resolveVars = (value, vars) => {
  if (typeof value === 'string') {
    return value.startsWith('$') ? vars[value.slice(1)] : value;
  }
  if (Array.isArray(value)) return value.map(entry => resolveVars(entry, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveVars(entry, vars)]),
    );
  }
  return value;
};

/** Выполнить цепочку действий правила: { action, ...params } → универсальный экшен. */
const runActionList = (partyState, list, { playerId, source, vars }) => {
  let state = partyState;

  for (const step of list ?? []) {
    const { action: actionName, ...params } = step;
    const action = actions[actionName];
    if (typeof action !== 'function') {
      throw new Error(`skills: действие "${actionName}" не найдено`);
    }
    state = action(state, {
      ...resolveVars(params, vars),
      playerId,
      source,
    });
  }

  return state;
};

/**
 * Прогон правил способности игрока в конкретном моменте.
 *
 * rule.when — цепочка фактов (AND) с захватом значений в переменные (var);
 * rule.any — «или»: список веток, каждая ветка — своя цепочка AND; срабатывает первая подошедшая;
 * rule.then — действия с $переменными.
 * Переменные появляются ТОЛЬКО из `var` в условиях правила: ничего снаружи не подставляется.
 * Данные момента (например, отмеченная цель) правило получает фактом (PICKED).
 * Правила независимы: срабатывают все, чьи условия сошлись (для развилок условия делают
 * взаимоисключающими). Игрок, чья это способность, передаётся в каждое действие как playerId,
 * а id способности — как source (им помечается открытое окно выбора).
 */
export const runSkillMoment = (partyState, playerId, moment) => {
  if (!isMoment(moment)) {
    throw new Error(`skills: неизвестный момент "${moment}"`);
  }

  const player = findPlayer(partyState, playerId);
  const skill = player?.skill;
  if (!skill?.rules?.length) return partyState;

  let state = partyState;

  for (const rule of skill.rules) {
    if (rule.moment !== moment) continue;

    const { ok, vars } = runConditions(state, rule, { playerId });
    if (!ok) continue;

    state = runActionList(state, rule.then, {
      playerId,
      source: skill.id,
      vars,
    });
  }

  return endGameIfFinished(state);
};
