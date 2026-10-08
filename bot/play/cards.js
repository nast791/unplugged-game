import { runConditions } from '#shared/facts/run.js';
import { fighterMatchesCard } from '#shared/helpers/cards.js';
import { resolveVars } from '#shared/helpers/vars.js';

/**
 * Оценка **своих** карт и умений: что свойство даёт и чем платит. Единица — примерно одна карта или
 * один шаг, то есть грубая шкала «сколько это стоит для партии», а не точный расчёт урона.
 *
 * Читается содержимое своей карты (`rules`, `options`) или своего умения (`player.skill`): игрок знает
 * свою колоду и свои карты — это не чужая рука, поэтому метрики остаются честными. Доступность ступени
 * проверять не нужно: движок сам помечает недоступный вариант (`disabled`) и не открывает пустое окно.
 *
 * Всё, что не опознали, даёт ноль: незнакомая механика играется как раньше, поэтому новая карта в
 * контенте не ломает поведение бота, а только не получает оценки.
 */
const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

const count = value => Math.max(1, num(value) || 1);

/** Сторона бойца из факта `COMBAT`: `select`/`player: 'opponent'` — чужой, остальное неизвестно. */
const combatSide = fact => {
  if (String(fact?.fact) !== 'COMBAT') return null;
  const side = fact.params?.select ?? fact.params?.player;
  return side == null ? null : String(side);
};

/** Сторона переменной правила: `FIGHTERS { side: 'self', var: 'heroes' }` → `heroes: self`. */
const varSides = rule => {
  const sides = {};
  const collect = list => {
    for (const fact of list ?? []) {
      if (fact?.var == null) continue;
      const side = fact.params?.side ?? combatSide(fact);
      if (side != null) sides[String(fact.var)] = String(side);
    }
  };

  collect(rule?.when);
  for (const branch of rule?.any ?? []) collect(branch);
  return sides;
};

/**
 * Чья сторона у действия: явная (`side: 'opponent'`) важнее выведенной из `$переменной`
 * (переменная взята фактом `FIGHTERS { side }`), иначе `self` — правила пишутся от лица владельца.
 * Словарь сторон контента: `self`, `opponent`, `teammate` (плюс `attack`/`defense` в правке боя).
 */
const isOpponent = side => side === 'opponent' || side === 'enemy';

const sideOf = (action, sides) => {
  if (action.side != null) return String(action.side);
  const refs = [action.fighterIds, action.fighters, action.of, action.cardIds]
    .flatMap(value => (Array.isArray(value) ? value : [value]))
    .map(value => String(value ?? ''));
  for (const ref of refs) {
    const name = ref.startsWith('$') ? ref.slice(1) : null;
    if (name && sides[name]) return sides[name];
  }
  return 'self';
};

/**
 * Что делает один экшен правила: польза и цена в единицах шкалы.
 *
 * `resolved` — тот же экшен с подставленными `$переменными`: **числа** берутся из него (`count`,
 * `value`, `delta`, `to`), а `side` и `op` — из исходного действия, потому что сторона выводится из
 * ссылки `$переменная` (`sideOf`), а в подставленном экшене там уже стоит id игрока.
 */
const actionWorth = (action, sides, resolved = action) => {
  const side = sideOf(action, sides);
  const amount = count(resolved.count ?? resolved.value ?? resolved.delta);

  switch (action.action) {
    // действие — самая дорогая валюта партии: за него платят картой
    case 'SET_ACTIONS': {
      const delta = num(resolved.delta);
      if (!delta) return {};
      return delta > 0 ? { value: 3 * delta } : { cost: 3 * Math.abs(delta) };
    }

    case 'SET_CARDS': {
      if (action.op === 'draw') return { value: 1.5 * amount };
      // сброс чужой руки — польза, своей — цена; сброс с колоды дешевле (верхняя карта и так ушла бы)
      if (action.op === 'discard') {
        if (isOpponent(side)) return { value: 1.5 * amount };
        return { cost: (action.from === 'deck' ? 0.5 : 1.5) * amount };
      }
      return { value: 0.5 * amount };
    }

    // ресурс героя: заряд — польза, трата — цена (катушки Теслы, пелена Анубиса)
    case 'SET_ITEM':
      if (action.to === 'active') return { value: 2 * amount };
      if (action.to === 'inactive' || action.from === 'active') return { cost: 1 * amount };
      return { value: 1 * amount };

    // здоровье: своим — лечение, чужим — урон; неизвестная сторона считается нейтрально
    case 'SET_HEALTH': {
      const delta = num(resolved.delta);
      if (!delta) return {};
      if (isOpponent(side)) {
        return delta < 0 ? { value: 2 * Math.abs(delta) } : { cost: 1 * delta };
      }
      if (side === 'self' || side === 'teammate') {
        return delta > 0 ? { value: 1 * delta } : { cost: 1 * Math.abs(delta) };
      }
      return { value: 0.5 * Math.abs(delta) };
    }

    // правка боя: «значение карты становится N» и отмена свойств противника
    case 'SET_COMBAT': {
      if (action.op === 'cancelEffects') return { value: 3 };
      if (action.op === 'value') {
        const delta = num(resolved.delta);
        if (delta) return { value: 0.5 * Math.abs(delta) };
        const to = num(resolved.to);
        // своему бойцу число поднимают, чужому — обнуляют: второе ценнее
        return isOpponent(side) ? { value: 2 } : { value: 0.5 * Math.max(0, to) };
      }
      return {};
    }

    case 'SET_MOVEMENT':
      return { value: 1.5 };
    case 'REVIVE_FIGHTER':
      return { value: 4 };
    case 'SET_FIGHTER_CELL':
    case 'SWAP_FIGHTERS':
      return { value: 1 };
    case 'SET_HAND_LIMIT':
    case 'SET_REVEAL':
    case 'RECALL_PLAYED_CARD':
    case 'SET_STATUS':
      return { value: 0.5 };

    // окно выбора само по себе ничего не даёт: его исход считает правило момента `picked`
    default:
      return {};
  }
};

/** Сумма по цепочке действий правила. */
const listWorth = (list, sides) => {
  let value = 0;
  let cost = 0;

  for (const action of list ?? []) {
    const worth = actionWorth(action, sides);
    value += worth.value ?? 0;
    cost += worth.cost ?? 0;
  }

  return { value, cost };
};

/** Варианты, которые правило разбирает в моменте `picked`: `PICKED { is: 'spend1' }`. */
const pickedOptions = rule => {
  const found = [];
  const collect = list => {
    for (const fact of list ?? []) {
      if (String(fact?.fact) === 'PICKED' && fact.params?.is != null)
        found.push(String(fact.params.is));
    }
  };

  collect(rule?.when);
  for (const branch of rule?.any ?? []) collect(branch);
  return found;
};

/**
 * Цена и польза варианта свойства. `card` — своя карта или своё умение (у обоих есть `rules` и
 * `options`); вариант ищется по правилам момента `picked`, которые на него ссылаются.
 * `known: false` — вариант не опознан (оценки нет, вес остаётся нейтральным).
 */
export const optionWorth = (card, optionId) => {
  let value = 0;
  let cost = 0;
  let known = false;

  for (const rule of card?.rules ?? []) {
    if (rule?.moment !== 'picked') continue;
    if (!pickedOptions(rule).includes(String(optionId))) continue;
    const worth = listWorth(rule.then, varSides(rule));
    value += worth.value;
    cost += worth.cost;
    if (worth.value || worth.cost) known = true;
  }

  return { value, cost, known };
};

/**
 * Сила карты в бою: число карты (`value`), а не усиление (`bonus`). Усиление — это топливо, оно
 * считается отдельно (`cardCostWeight`), поэтому в бою карты сравниваются по числу.
 */
export const attackStrength = card => Math.max(0, num(card?.value));

/**
 * Моменты, на которых правило меняет саму карту боя: вскрытие числа, мгновенный эффект и исход.
 * Момент `picked` сюда не входит — это выбор варианта свойства, его считает `optionWorth`.
 */
const PROMISE_MOMENTS = new Set(['immediately', 'duringCombat', 'afterCombat']);

/** Свойства боя, которых до расчёта не существует: обещать их нельзя (и подглядывать в них тоже). */
const UNKNOWABLE = ['winner', 'bonus', 'effects'];

/**
 * Мои бойцы, которыми эту карту можно объявить: в будущем бою «своя сторона» — тот, кем я ударю.
 * До объявления карты он ещё не выбран, поэтому обещание считается возможным, если подходит **любой**
 * из них (карта с привязкой — только свои бойцы этого вида, `fighterMatchesCard`).
 */
const ownFightersFor = (state, playerId, card) =>
  ((state.players ?? []).find(player => String(player.id) === String(playerId))?.fighters ?? [])
    .filter(
      fighter =>
        (Number(fighter.currentHp) || 0) > 0 &&
        fighter.currentPosition != null &&
        fighterMatchesCard(fighter, card ?? {}),
    )
    .map(fighter => String(fighter.id));

/**
 * Проверить условия правила на живом состоянии: связывает переменные фактов с бойцами сторон
 * (`$heroes`, `$foes`), а нечитаемые до расчёта боя факты (`COMBAT` без открытого боя) заменяет
 * выбранной целью. Возвращает `{ ok, vars }` — как `runConditions`.
 *
 * Общий для обещания боя (`cardPromise`) и пользы эффекта (`effectWorth`): оба отвечают на один вопрос
 * «сработает ли это правило **сейчас**», различается только список разбираемых моментов.
 */
const conditionsFor = (rule, state, playerId, { target = null, open = false } = {}) => {
  const bound = {};
  let usable = true;
  const strip = list => {
    const kept = [];
    for (const fact of list ?? []) {
      if (String(fact?.fact) !== 'COMBAT') {
        kept.push(fact);
        continue;
      }
      const params = fact.params ?? {};
      if (UNKNOWABLE.some(key => params[key] != null)) {
        usable = false; // чужую карту и исход боя не читаем даже в открытом бою
      } else if (open) {
        kept.push(fact); // бой открыт: участники известны, факт проверится сам
      } else if (fact.var == null) {
        continue; // связывать нечего: без переменной факт ни на что не влияет
      } else {
        const subject = String(params.select ?? params.player ?? '');
        if (subject === 'self' || subject === 'attacker' || subject === 'defender') {
          const ours = ownFightersFor(state, playerId, rule?.card);
          if (ours.length === 0) usable = false;
          else bound[String(fact.var)] = ours;
        } else {
          const foe = params.player != null ? target?.playerId : target?.fighterId;
          if (foe == null) usable = false;
          else bound[String(fact.var)] = params.player != null ? String(foe) : [String(foe)];
        }
      }
    }
    return kept;
  };

  if (!usable) return { ok: false, vars: {} };
  const conditions = { when: strip(rule?.when), any: (rule?.any ?? []).map(strip) };
  if (!usable) return { ok: false, vars: {} };
  return runConditions(state, conditions, { playerId, vars: bound });
};

/**
 * Польза **эффектной** карты в этой позиции: сколько она сделает, если сыграть её сейчас.
 *
 * Ценность считается по правилам момента `effect` (сама карта, не бой): условия проверяет движок теми
 * же фактами, что и в партии, а результат оценивается той же шкалой, что варианты свойств (`listWorth`).
 *
 * `fires` — сколько правил карты выполнилось **сейчас**, по всем её моментам: это ответ на вопрос
 * «сработает ли свойство вообще». Эффектная карта, у которой `fires === 0`, не сделает ничего:
 * правила момента `effect` не выполняются, а `picked`/`duringCombat` без эффекта не наступают.
 * `known` — есть ли что проверять: карту без правил не наказываем, иначе новая механика в контенте
 * молча выпадала бы из игры.
 */
export const effectWorth = (card, state, playerId, { target = null } = {}) => {
  const rules = card?.rules ?? [];
  let value = 0;
  let cost = 0;
  let fires = 0;

  for (const rule of rules) {
    // связывание переменных смотрит на карту целиком: правило карты «мои бойцы» проверяется по ней
    const checked = conditionsFor({ ...rule, card }, state, playerId, { target });
    if (!checked.ok) continue;
    fires += 1;
    if (String(rule?.moment) !== 'effect') continue;

    const sides = varSides(rule);
    for (const action of rule.then ?? []) {
      let resolved = null;
      try {
        resolved = resolveVars({ ...action }, checked.vars);
      } catch {
        continue; // переменная правила пришла не из условий — обещать нечего
      }
      const worth = actionWorth(action, sides, resolved);
      value += worth.value ?? 0;
      cost += worth.cost ?? 0;
    }
  }

  return { value, cost, fires, known: rules.length > 0 };
};

/**
 * Обещание карты: что её собственные правила добавляют к напечатанному числу **в этой позиции**.
 *
 * Условия проверяет сам движок (`runConditions`), а не пересказ текста карты: «Погребальный звон»
 * (4) становится 6, потому что его правило на `movedThisTurn` выполнено. До объявления боя факты
 * `COMBAT` проверить нечем, поэтому участники (`player`, `select`) подставляются целью, которую
 * политика выбрала заранее, — и только если бой ещё не открыт. Свойства, которых до расчёта не
 * существует (`winner`, `bonus`, `effects`), правило отменяют: обещать победу нельзя, а усиление чужой
 * карты бот не подглядывает — проекция отдаёт её владельцу карты, а не защитнику (§13).
 *
 * Возвращает `{ strength, worth }`: `strength` — **эффективное число** карты (замена `value`, а не
 * добавка к ней), `worth` — прочая польза в единицах этого модуля (сброс чужой карты, добор, лечение).
 */
export const cardPromise = (card, state, playerId, { target = null, open = false } = {}) => {
  let strength = attackStrength(card);
  let worth = 0;

  for (const rule of card?.rules ?? []) {
    if (!PROMISE_MOMENTS.has(String(rule?.moment))) continue;

    const checked = conditionsFor({ ...rule, card }, state, playerId, { target, open });
    if (!checked.ok) continue;

    const sides = varSides(rule);
    for (const action of rule.then ?? []) {
      let resolved = null;
      try {
        resolved = resolveVars({ ...action }, checked.vars);
      } catch {
        continue; // переменная правила пришла не из условий — обещать нечего
      }

      const side = sideOf(action, sides); // сторону считает исходное действие: в `$переменная` уже id
      const to = num(resolved.to);
      if (
        resolved.action === 'SET_COMBAT' &&
        resolved.op === 'value' &&
        !isOpponent(side) &&
        to > 0
      ) {
        strength = Math.max(strength, to);
        continue;
      }
      if (resolved.action === 'SET_HEALTH' && isOpponent(side) && num(resolved.delta) < 0) {
        strength += Math.abs(num(resolved.delta));
        continue;
      }
      // сторону считает исходное действие: в подставленном `$переменная` уже стоит id игрока
      worth += actionWorth(action, sides, resolved).value ?? 0;
    }
  }

  return { strength, worth };
};

/**
 * Метки карты: по ним видно, что сброс карты кормит ресурс героя (осколок Снежной королевы).
 */
export const cardTags = card => new Set((card?.tags ?? []).map(String));
