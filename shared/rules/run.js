import { actions } from '#shared/actions/index.js';
import { isMoment } from '#shared/constants/moments.js';
import { runConditions } from '#shared/facts/run.js';
import { setDeathRunner } from '#shared/helpers/death.js';
import { hasMissing, resolveVars } from '#shared/helpers/vars.js';
import { endGameIfFinished } from '#shared/helpers/turn.js';

/**
 * Варианты свойства с пометкой доступности. У варианта карты может быть своё условие (`options[].when`) —
 * «эта ступень требует двух катушек», — и тогда недоступный вариант попадает в окно с `disabled: true`:
 * игрок его видит, но выбрать не может (клиент рисует его неактивным, `SET_TARGETING pick` отклоняет).
 * Условие читается тем же `runConditions`, что и условия правила, поэтому `$переменные` в нём работают.
 * Если недоступны все варианты, окно не открывается вовсе — выбирать нечего.
 * Поля кандидата сохраняются: окно по чужим картам (`kind: 'options'`) несёт в них название и бонус,
 * и клиент рисует по ним список выбора.
 */
const optionsWithStates = (partyState, candidates, { card, playerId, vars }) => {
  if (!Array.isArray(candidates)) return candidates;

  return candidates.map(entry => {
    const optionId =
      entry != null && typeof entry === 'object' ? (entry.optionId ?? entry.id) : entry;
    const option = (card?.options ?? []).find(item => String(item.id) === String(optionId));
    const hasCondition = Boolean(option?.when || option?.any);

    return {
      ...(entry != null && typeof entry === 'object' ? entry : {}),
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
    // `$remembered.<ключ>` читается из служебного `state._remember` (его пишет `SET_CARDS { remember }`):
    // запомненной карты может не быть — тогда параметр получает MISSING, и шаг не выполняется вовсе
    // (свойство просто ничего не делает: «в руке противника нечего было сбрасывать — и усиления нет»).
    const resolved = resolveVars(params, vars, { remembered: state._remember });
    if (hasMissing(resolved)) continue;

    // варианты окна разбираются уже подставленными: `candidates: '$mirror'` приходит из факта
    // (карты чужой руки), и до подстановки это строка, а не список — читать её как список нельзя
    const ready =
      resolved.kind === 'options'
        ? {
            ...resolved,
            candidates: optionsWithStates(state, resolved.candidates, {
              card,
              playerId,
              vars,
            }),
          }
        : resolved;

    // все варианты недоступны — выбирать нечего, окно не открываем (свойство не предлагается)
    if (
      resolved.kind === 'options' &&
      Array.isArray(ready.candidates) &&
      ready.candidates.length > 0 &&
      ready.candidates.every(entry => entry.disabled)
    ) {
      continue;
    }

    state = action(state, {
      ...ready,
      playerId,
      source,
      // сыгранная карта — для действий, которые работают с самой картой («Вечный огонь»:
      // возврат своей копии в руку со снижением значения). У способностей и фаз её нет: null.
      playedCard: card ?? null,
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

/** Глубина прогона правил: транзиент `_remember` живёт до конца самого внешнего прогона. */
let rulesDepth = 0;

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
 * данные момента правило получает фактом (PICKED, COMBAT, …). Исключение — служебный транзиент
 * `$remembered.<ключ>.<поле>`: его пишет `SET_CARDS { remember }`, а читает слой правил.
 * Правила независимы: срабатывают все, чьи условия сошлись (у каждого правила в бою свой шаг очереди,
 * поэтому ступени одного свойства описывают одним правилом, а недоступную ступень помечает её собственное
 * условие в `card.options`). **Условия всех правил момента читаются до того, как выполнено первое
 * действие:** правило не может «включить» условие соседнего — иначе взаимоисключающие ветки одной карты
 * («жив первый дух / жив второй / жив третий») срабатывали бы все подряд. Сами действия идут по
 * накопительному состоянию, друг за другом. В каждое действие движок добавляет playerId (чей ход /
 * чья карта) и source (id способности или карты). В конце — проверка победы.
 */
export const runRules = (partyState, rules, moment, { playerId, source, card, autoPick } = {}) => {
  if (!isMoment(moment)) {
    throw new Error(`rules: неизвестный момент "${moment}"`);
  }
  if (!rules?.length) return partyState;

  // Условия всех правил момента считаем ДО действий: правила независимы, и действие одного не
  // «включает» условия следующего. Иначе взаимоисключающие ветки одной карты («первый живой дух,
  // второй, третий») срабатывали бы все подряд — первая же ветка меняет то, на что смотрят условия
  // остальных. Состояние экшены меняют на месте, поэтому «снимок» тут — именно первый проход.
  const matched = [];

  for (const rule of rules) {
    if (rule.moment !== moment) continue;

    const { ok, vars } = runConditions(partyState, rule, { playerId });
    if (ok) matched.push({ rule, vars });
  }

  let state = partyState;
  rulesDepth += 1;

  try {
    for (const { rule, vars } of matched) {
      state = runActionList(state, rule.then, { playerId, source, vars, card });

      // выбор без выбора: кандидат один — отмечаем его сами и доигрываем момент picked
      if (autoPick && state.targeting?.auto === true) {
        state = autoPick(state, playerId);
      }
    }

    return endGameIfFinished(state);
  } finally {
    rulesDepth -= 1;
    // `_remember` — служебный транзиент, как `_death`: в `stateFields` его нет, наружу он не уходит,
    // а живёт только на время прогона правил момента. Внешний прогон (вложенный вызов пришёл из
    // действия, например смерть в `lost`) чистит его последним, чтобы вложенный не стёр чужое.
    if (rulesDepth === 0) delete state._remember;
  }
};

/**
 * Момент `lost` для действия здоровья: сначала правила умения владельца погибшего бойца, затем правила
 * карты, которая нанесла смертельный урон (`info.playedCard`). Кто именно погиб, правило узнаёт фактом
 * `DEATH` — сведения лежат в служебном `state._death` только на время прогона (в `stateFields` поля
 * нет, значит наружу оно не уходит). `source` в них — id источника: у карты её id (не ключ копии),
 * у умения id умения.
 */
const runningLostSources = new Set();

/** Id источника смерти: карта — её id, иначе ключ действия (id умения или фазы). */
const deathSourceOf = info => {
  const cardId = info?.playedCard?.id;
  if (cardId != null) return String(cardId);
  return info?.source == null ? null : String(info.source);
};

setDeathRunner((partyState, player, fighter, info = {}) => {
  const skillRules = player?.skill?.rules ?? [];
  const card = info.playedCard ?? null;
  const cardRules = card?.rules ?? [];
  const source = deathSourceOf(info);

  const hasSkill = skillRules.some(rule => rule.moment === 'lost');
  // Карта, которая уже разбирает собственную смерть, второй раз не запускается: правило `lost`,
  // добивающее бойца снова, не уводит смерть по кругу.
  const runCard =
    source != null &&
    cardRules.some(rule => rule.moment === 'lost') &&
    !runningLostSources.has(source);
  if (!hasSkill && !runCard) return partyState;

  // вложенная смерть (правило `lost` добило кого-то ещё) вернёт внешние сведения на место
  const outerDeath = partyState._death;
  partyState._death = {
    fighterId: String(fighter.id),
    group: fighter.group == null ? null : String(fighter.group),
    type: fighter.type ?? null,
    playerId: String(player.id),
    source,
  };

  if (runCard) runningLostSources.add(source);
  try {
    // порядок: сначала умение героя, потом карта-источник
    let state = hasSkill
      ? runRules(partyState, skillRules, 'lost', { playerId: player.id, source: player.skill.id })
      : partyState;

    if (runCard) {
      state = runRules(state, cardRules, 'lost', {
        playerId: info.playerId ?? player.id,
        source: card.id,
        card,
      });
    }

    return state;
  } finally {
    if (outerDeath == null) delete partyState._death;
    else partyState._death = outerDeath;
    if (runCard) runningLostSources.delete(source);
  }
});
