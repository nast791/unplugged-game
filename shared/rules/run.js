import { actions } from '#shared/actions/index.js';
import { isMoment } from '#shared/constants/moments.js';
import { runConditions } from '#shared/facts/run.js';
import { resolveVars } from '#shared/helpers/vars.js';
import { endGameIfFinished } from '#shared/helpers/turn.js';

/**
 * Варианты свойства с пометкой доступности. У варианта карты может быть своё условие (`options[].when`) —
 * «эта ступень требует двух катушек», — и тогда недоступный вариант попадает в окно с `disabled: true`:
 * игрок его видит, но выбрать не может (клиент рисует его неактивным, `SET_TARGETING pick` отклоняет).
 * Условие читается тем же `runConditions`, что и условия правила, поэтому `$переменные` в нём работают.
 * Если недоступны все варианты, окно не открывается вовсе — выбирать нечего.
 */
const optionsWithStates = (partyState, candidates, { card, playerId, vars }) => {
  if (!Array.isArray(candidates)) return candidates;

  return candidates.map(entry => {
    const optionId =
      entry != null && typeof entry === 'object' ? (entry.optionId ?? entry.id) : entry;
    const option = (card?.options ?? []).find(item => String(item.id) === String(optionId));
    const hasCondition = Boolean(option?.when || option?.any);

    return {
      optionId,
      disabled:
        hasCondition &&
        !runConditions(partyState, { when: option.when, any: option.any }, { playerId, vars }).ok,
    };
  });
};

/** Выполнить цепочку действий правила: { action, ...params } → универсальный экшен. */
const runActionList = (partyState, list, { playerId, source, vars, card }) => {
  let state = partyState;

  for (const step of list ?? []) {
    const { action: actionName, ...params } = step;
    const action = actions[actionName];
    if (typeof action !== 'function') {
      throw new Error(`rules: действие "${actionName}" не найдено`);
    }
    const ready =
      params.kind === 'options'
        ? {
            ...params,
            candidates: optionsWithStates(state, params.candidates, {
              card,
              playerId,
              vars,
            }),
          }
        : params;

    // все варианты недоступны — выбирать нечего, окно не открываем (свойство не предлагается)
    if (
      params.kind === 'options' &&
      ready.candidates.length > 0 &&
      ready.candidates.every(entry => entry.disabled)
    ) {
      continue;
    }

    state = action(state, {
      ...resolveVars(ready, vars),
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
 * rule.any — «или»: список веток (каждая ветка — своя цепочка AND); срабатывает первая подошедшая;
 * rule.then — действия с $переменными.
 * `card` — карта, чьи правила прогоняем (её `options[].when` решает, какие варианты свойства недоступны).
 * `autoPick` — как доиграть окно, открытое с `auto: true`, когда кандидат в нём ровно один: окно
 * закрывается без вопроса игроку. Функцию даёт вызывающий: способность и карта разыгрываются своими
 * исполнителями (`skills/run.js`, `cards/run.js`), и правила о них ничего не знают.
 * Переменные появляются ТОЛЬКО из `var` в условиях правила: ничего снаружи не подставляется,
 * данные момента правило получает фактом (PICKED, COMBAT, …).
 * Правила независимы: срабатывают все, чьи условия сошлись (у каждого правила в бою свой шаг очереди,
 * поэтому ступени одного свойства описывают одним правилом, а недоступную ступень помечает её собственное
 * условие в `card.options`). В каждое действие движок добавляет playerId (чей ход / чья карта) и source
 * (id способности или карты). В конце — проверка победы.
 */
export const runRules = (partyState, rules, moment, { playerId, source, card, autoPick } = {}) => {
  if (!isMoment(moment)) {
    throw new Error(`rules: неизвестный момент "${moment}"`);
  }
  if (!rules?.length) return partyState;

  let state = partyState;

  for (const rule of rules) {
    if (rule.moment !== moment) continue;

    const { ok, vars } = runConditions(state, rule, { playerId });
    if (!ok) continue;

    state = runActionList(state, rule.then, { playerId, source, vars, card });

    // выбор без выбора: кандидат один — отмечаем его сами и доигрываем момент picked
    if (autoPick && state.targeting?.auto === true) {
      state = autoPick(state, playerId);
    }
  }

  return endGameIfFinished(state);
};
