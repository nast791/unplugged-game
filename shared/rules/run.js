import { actions } from '#shared/actions-new/index.js';
import { isMoment } from '#shared/constants/moments.js';
import { runConditions } from '#shared/facts-new/run.js';
import { resolveVars } from '#shared/helpers/vars.js';
import { endGameIfFinished } from '#shared/helpers/turn.js';

/** Выполнить цепочку действий правила: { action, ...params } → универсальный экшен. */
const runActionList = (partyState, list, { playerId, source, vars }) => {
  let state = partyState;

  for (const step of list ?? []) {
    const { action: actionName, ...params } = step;
    const action = actions[actionName];
    if (typeof action !== 'function') {
      throw new Error(`rules: действие "${actionName}" не найдено`);
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
 * Подошли ли условия правила (без выполнения действий). Нужно тому, кто ведёт учёт эффектов:
 * «сработал» отличается от «применять нечего».
 */
export const ruleMatches = (partyState, rule, context = {}) =>
  runConditions(partyState, rule, context).ok;

/**
 * Прогон набора правил в конкретном моменте. Исполнитель общий для способностей героев и карт.
 *
 * rule.moment — момент из shared/constants/moments.js; правило с другим моментом не рассматривается;
 * rule.when — цепочка фактов (AND) с захватом значений в переменные (var);
 * rule.any — «или»: список веток, каждая ветка — своя цепочка AND; срабатывает первая подошедшая;
 * rule.then — действия с $переменными.
 * Переменные появляются ТОЛЬКО из `var` в условиях правила: ничего снаружи не подставляется,
 * данные момента правило получает фактом (PICKED, COMBAT, …).
 * Правила независимы: срабатывают все, чьи условия сошлись (для развилок условия делают
 * взаимоисключающими). В каждое действие движок добавляет playerId (чей ход / чья карта) и source
 * (id способности или карты). В конце — проверка победы: эффект мог добить последнего героя.
 */
export const runRules = (partyState, rules, moment, { playerId, source } = {}) => {
  if (!isMoment(moment)) {
    throw new Error(`rules: неизвестный момент "${moment}"`);
  }
  if (!rules?.length) return partyState;

  let state = partyState;

  for (const rule of rules) {
    if (rule.moment !== moment) continue;

    const { ok, vars } = runConditions(state, rule, { playerId });
    if (!ok) continue;

    state = runActionList(state, rule.then, { playerId, source, vars });
  }

  return endGameIfFinished(state);
};
