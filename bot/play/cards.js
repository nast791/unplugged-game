import { rules } from '#shared/constants/rules.js';
import { runConditions } from '#shared/facts/run.js';
import { fighterMatchesCard } from '#shared/helpers/cards.js';
import { resolveVars } from '#shared/helpers/vars.js';
import { bonusOutcomes, expectedBonus, expectedRuleShare } from './counting.js';
import { cellDistances } from './actionFeatures.js';
import { gene } from './policy.js';

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

/** Цена карты, ушедшей из сброса **обратно в колоду**: это не сброс топлива, а потеря ресурса. */
const MOVE_BACK_COST = 1.5;

/**
 * Изменение здоровья из действия: движок принимает и `delta` (знак в числе), и `damage` (урон
 * положительным числом). «Зал суда» бьёт `damage: '$n'`, где `n` — число карт эффектов в сбросе: без
 * этой ветки оценка получала `undefined` и давала карте **ноль** пользы при 140 розыгрышах (§74).
 */
const healthDelta = resolved => {
  if (resolved?.delta != null) return num(resolved.delta);
  const damage = num(resolved?.damage);
  return damage === 0 ? 0 : -Math.abs(damage);
};

/**
 * Экономика руки для оценки карт: сколько карт влезает в мою руку без потерь (`hand`/`limit`), сколько в
 * чужую (`rivalHand`/`rivalLimit`), что у соперника с колодой и сколько стоит его истощение.
 *
 * Зачем это понадобилось. Цена добора — не константа: карта сверх лимита уходит в сброс в конце хода
 * (колода сожжена), а принудительный добор на пустой колоде бьёт всех бойцов владельца на
 * `rules.exhaustionDamage`. Без этих чисел знак пользы у `SET_CARDS { op: 'draw' }` неверен в обе
 * стороны: добор себе при полной руке считался полной пользой, а добор **противнику** — тоже пользой.
 *
 * Лимит руки берётся у **каждого игрока** (`player.handLimit`, иначе `rules.maxHandSize`), а не из правил
 * целиком: умение ставит свой лимит чужой стороне. «Вечная мерзлота» Снежной королевы при 5+ осколках в её
 * сбросе делает `SET_HAND_LIMIT { of: 'enemies', value: 5 }` — лимит 5 получают **её враги**, сама она
 * остаётся на 7 (`server/content/heroes/snow-queen/index.js`).
 */
export const handContext = (state, playerId) => {
  const players = state?.players ?? [];
  const key = String(playerId);
  const mine = players.find(player => String(player.id) === key) ?? null;
  const others = players.filter(player => String(player.id) !== key);
  const limitOf = player => {
    const limit = Number(player?.handLimit);
    return Number.isFinite(limit) && limit > 0 ? limit : rules.maxHandSize;
  };
  const size = player => (player?.hand?.cards ?? []).length;
  const deck = player => (player?.deck?.cards ?? []).length;
  // защитный запас: ответить на удар может `defense` и `hybrid` (гибрид бьёт и защищает). Считается и
  // в руке, и в невышедшей колоде — запас нужен на весь остаток партии, а не на этот ход
  const defensive = card => card != null && ['defense', 'hybrid'].includes(String(card?.type));
  const defenses = player => (player?.hand?.cards ?? []).filter(defensive).length;
  const deckDefenses = player => (player?.deck?.cards ?? []).filter(defensive).length;
  // цена истощения в шкале оценок: 2 за hp героя и 1 за hp помощника — как считается материал стороны
  const material = player =>
    (player?.fighters ?? [])
      .filter(fighter => (Number(fighter.currentHp) || 0) > 0)
      .reduce((total, fighter) => total + (fighter.type === 'hero' ? 1 : 0.5), 0);

  return {
    hand: size(mine),
    limit: limitOf(mine),
    // запас защит: рука + колода (`policy.js: stockFactor`, ген `stock`)
    defenses: defenses(mine),
    deckDefenses: deckDefenses(mine),
    rivalHand: others.reduce((total, player) => total + size(player), 0),
    rivalLimit: others.length > 0 ? Math.min(...others.map(limitOf)) : rules.maxHandSize,
    rivalDeck: others.reduce((total, player) => total + deck(player), 0),
    rivalMaterial: others.reduce((total, player) => total + material(player), 0),
    exhaust: Number(rules.exhaustionDamage) || 0,
  };
};

/**
 * Добор карт: знак зависит от того, **чья** рука наполняется.
 *
 * - **себе** — польза, но только та часть, что влезает в лимит; карты сверх него уходят в сброс в конце
 *   хода, то есть колода сожжена (та же цена, что у добора на сброс с колоды — 0,5 за карту);
 * - **противнику** — цена: его карты его и усиливают. Плюсом становится только перебор его руки и
 *   пустая его колода: за карту, которой не нашлось, все его бойцы получают истощение (карта — 2 hp
 *   героя, помощник — половина).
 *
 * Без контекста (окно варианта свойства без состояния) берётся прежняя цена за карту — знак всё равно
 * верный, потому что сторона известна из самого действия.
 */
const drawWorth = (amount, side, context) => {
  if (isOpponent(side)) {
    if (context != null && Number(context.rivalDeck) <= 0) {
      const burn = 2 * Number(context.exhaust) * Number(context.rivalMaterial);
      return { value: burn * amount };
    }
    if (context == null) return { cost: 1.5 * amount };
    const room = Math.max(0, Number(context.rivalLimit) - Number(context.rivalHand));
    const fed = Math.min(amount, room);
    return { value: 1.5 * (amount - fed), cost: 1.5 * fed };
  }
  if (context == null) return { value: 1.5 * amount };
  const room = Math.max(0, Number(context.limit) - Number(context.hand));
  const kept = Math.min(amount, room);
  return { value: 1.5 * kept, cost: 0.5 * (amount - kept) };
};

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

/** Роли стороны, которые движок понимает в `of` (`shared/helpers/base.js: playerByRole`). */
const SIDE_ROLES = ['self', 'opponent', 'enemy', 'teammate'];

const sideOf = (action, sides) => {
  if (action.side != null) return String(action.side);
  // `of: 'opponent'` — это сторона, а не переменная: так правила зовут противника, не заводя переменную
  // («Ледяное зеркало» Снежной королевы). Без этой ветки сброс чужой карты читался как сброс своей.
  if (action.of != null && SIDE_ROLES.includes(String(action.of))) return String(action.of);
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
const actionWorth = (action, sides, resolved = action, context = null) => {
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
      if (action.op === 'draw') return drawWorth(amount, side, context);
      // сброс чужой руки — польза, своей — цена; сброс с колоды дешевле (верхняя карта и так ушла бы)
      if (action.op === 'discard') {
        if (isOpponent(side)) return { value: 1.5 * amount };
        return { cost: (action.from === 'deck' ? 0.5 : 1.5) * amount };
      }
      // перекладывание из сброса в колоду: у Снежной королевы сброс — это **счётчик осколков**, и карта,
      // ушедшая из него, роняет порог её карт. «Кристальный резонанс» платил за это плюсом 0,5, то есть
      // сброс осколка считался пользой (`.docs/bot-strategies.md`, «не замешивать осколок обратно»)
      if (action.op === 'move') {
        const toDeck = String(action.to ?? '') === 'deck';
        const toHand = String(action.to ?? '') === 'hand';
        if (String(action.from) === 'discard' && toDeck && gene('resonance', 1) > 0) {
          return { cost: MOVE_BACK_COST * amount };
        }
        return toHand ? { value: 1.5 * amount } : { value: 0.5 * amount };
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
      const delta = healthDelta(resolved);
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

    // перемещение: сам шаг стоит 1,5, а длина, проход сквозь строй и проход с уроном или кражей
    // добавляют по своей шкале. Сколько бойцов реально стоит на маршруте, оценка не знает (маршрут
    // считается в партии по карте), поэтому урон и кража берутся по одному разу за пункт — движок
    // бьёт каждого пройденного не больше одного раза за окно
    case 'SET_MOVEMENT': {
      const budget = num(action.budget);
      let value = 1.5;
      // каждый шаг сверх первого дешевле первого: дальний манёвр — это свобода, а не второй ход
      if (budget > 1) value += 0.25 * (budget - 1);
      if (action.throughEnemies === true) value += 0.5;
      // урон чужому бойцу и лечение себе — по шкале `SET_HEALTH`, но вполовину: урон на проходе
      // не гарантирован (врагов на маршруте может и не быть), а маршрут оценке неизвестен
      value += 1 * Math.max(0, num(action.damageOnPass));
      value += 1 * Math.max(0, num(action.healOnPass));
      return { value };
    }
    // временная стихия клетки: лава под своим героем кормит пакет Ифрита, остальное — мелочь
    case 'SET_CELL_TERRAIN': {
      if (action.op === 'clear') return {};
      return String(action.terrain ?? '') === 'lava' ? { value: 1.2 } : { value: 0.4 };
    }
    case 'REVIVE_FIGHTER':
      return { value: 4 };
    case 'SET_FIGHTER_CELL':
    case 'SWAP_FIGHTERS':
      return { value: 1 };
    case 'SET_HAND_LIMIT':
    case 'SET_REVEAL':
    case 'RECALL_PLAYED_CARD':
      return { value: 0.5 };
    // заморозка отнимает у бойца шаг и телепорт до конца хода — это дороже прочих статусов на полкарты
    case 'SET_STATUS':
      return { value: String(action.status ?? '') === 'frozen' ? 1.5 : 0.5 };

    // окно выбора само по себе ничего не даёт: его исход считает правило момента `picked`
    default:
      return {};
  }
};

/** Сумма по цепочке действий правила. */
const listWorth = (list, sides, context = null) => {
  let value = 0;
  let cost = 0;

  for (const action of list ?? []) {
    const worth = actionWorth(action, sides, action, context);
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
 *
 * `context` — экономика руки (`handContext`): без него добор оценивается по числу карт, а с ним — по
 * тому, сколько из них влезет в руку.
 */
export const optionWorth = (card, optionId, context = null) => {
  let value = 0;
  let cost = 0;
  let known = false;

  for (const rule of card?.rules ?? []) {
    if (rule?.moment !== 'picked') continue;
    if (!pickedOptions(rule).includes(String(optionId))) continue;
    const worth = listWorth(rule.then, varSides(rule), context);
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
const PROMISE_MOMENTS = new Set(['immediately', 'duringCombat', 'afterCombat', 'lost']);

/** Свойства боя, которых до расчёта не существует: обещать их нельзя (и подглядывать в них тоже). */
const UNKNOWABLE = ['winner', 'bonus', 'effects'];

/** Сколько урона сама карта наносит бойцам группы: по этому числу решается, погибнет ли тело. */
const selfDamageToGroup = (card, group) => {
  let damage = 0;
  for (const rule of card?.rules ?? []) {
    const bound = new Set(
      (rule?.when ?? [])
        .filter(fact => String(fact?.params?.group ?? '') === String(group) && fact?.var != null)
        .map(fact => String(fact.var)),
    );
    for (const action of rule?.then ?? []) {
      const ref = String(action?.fighterIds ?? '');
      if (!ref.startsWith('$') || !bound.has(ref.slice(1))) continue;
      if (String(action.action) === 'SET_HEALTH' && num(action.delta) < 0) {
        damage += Math.abs(num(action.delta));
      }
    }
  }

  return damage;
};

/**
 * Сбудется ли гибель от этой карты (`DEATH { group, source }`, момент `lost`). Условие проверяется не
 * фактом (гибели ещё нет), а арифметикой: у моей группы должен быть боец, которому урона этой карты
 * хватает, чтобы умереть. Так «Жертва» (4, бонус 3) обещает +1 действие только при вороне с 1 hp.
 */
const deathPromised = (state, playerId, card, params) => {
  const group = String(params?.group ?? '');
  const source = String(params?.source ?? '');
  if (group === '' || source === '' || String(card?.id ?? '') !== source) return false;
  const damage = selfDamageToGroup(card, group);
  if (damage <= 0) return false;
  const mine = (state?.players ?? []).find(player => String(player.id) === String(playerId));
  return (mine?.fighters ?? []).some(
    fighter =>
      String(fighter.group ?? fighter.id) === group &&
      (Number(fighter.currentHp) || 0) > 0 &&
      (Number(fighter.currentHp) || 0) <= damage,
  );
};

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
 * выбранной целью. Возвращает `{ ok, vars, pending }` — как `runConditions`.
 *
 * Общий для обещания боя (`cardPromise`) и пользы эффекта (`effectWorth`): оба отвечают на один вопрос
 * «сработает ли это правило **сейчас**», различается только список разбираемых моментов.
 *
 * **Скрытые числа боя оцениваются по остатку колоды** (`.docs/bot-strategies.md`, весы Анубиса). Усиление
 * чужой карты (`COMBAT { bonus: 'opponent' }`) и наличие у неё свойств (`COMBAT { effects: 'opponent' }`)
 * до вскрытия неизвестны, поэтому раньше правило отбрасывалось целиком — и «Помилование»/«Наказание»
 * Анубиса не обещали ничего. Теперь своё усиление берётся из своей карты (оно известно), чужое — из
 * **распределения** по невышедшим картам соперника (`counting.js: bonusOutcomes`): обе половины весов
 * оцениваются по своим исходам и взвешиваются их вероятностями. `BOT_GENE_ESTIMATE=0` возвращает прежнее
 * «не обещаем».
 *
 * **Номер действия** (`AP { spentMin }`) читается с поправкой на само объявление: карта — это и есть
 * действие, и к моменту её правил (`immediately`, `duringCombat`, `effect`) ход уже списал за неё
 * действие. Поэтому окно, которое открывается **этим** действием, считается наступившим; окно впереди
 * помечает правило `pending` (обещание не сейчас), а пройденное окно правило убивает.
 */
const withinBounds = (params, value, vars) => {
  const bounds = ['min', 'max', 'over', 'under'].filter(
    key => params[key] != null && params[key] !== '',
  );
  return bounds.every(key => {
    const raw = params[key];
    const ref = String(raw).startsWith('$') ? vars[String(raw).slice(1)] : raw;
    const limit = Array.isArray(ref) ? Number.NaN : Number(ref);
    if (!Number.isFinite(limit)) return false;
    if (key === 'min') return value >= limit;
    if (key === 'max') return value <= limit;
    if (key === 'over') return value > limit;
    return value < limit;
  });
};

/**
 * Сторона боя, чьё усиление оценивается распределением: `opponent`/`enemy` — чужая карта. Своя (`self`)
 * известна, а `attacker`/`defender` зависит от роли в бою, которую при объявлении не знаем.
 */
const estimatedBonusSide = params => {
  const side = String(params?.bonus ?? '');
  if (side === '') return null;
  return isOpponent(side) ? 'opponent' : side === 'self' ? 'self' : null;
};

const conditionsFor = (
  rule,
  state,
  playerId,
  { target = null, open = false, bonusValue = null } = {},
) => {
  const bound = {};
  let usable = true;
  let pending = false;
  const ownCard = rule?.card ?? null;
  const strip = list => {
    const kept = [];
    for (const fact of list ?? []) {
      // номер действия: объявляемая карта — уже действие, поэтому к её правилам счётчик сдвинут на один
      if (String(fact?.fact) === 'AP') {
        const turn = state?.turn ?? {};
        const total = Number(turn.actionsTotal) || 0;
        const spent = Math.max(0, total - (Number(turn.actionsLeft) || 0));
        const now = spent + (String(turn.playerId ?? '') === String(playerId) ? 1 : 0);
        const spentMin = fact.params?.spentMin == null ? null : Number(fact.params.spentMin);
        const spentMax = fact.params?.spentMax == null ? null : Number(fact.params.spentMax);
        if (spentMax != null && now > spentMax) {
          usable = false;
        } else if (spentMin != null && now < spentMin) {
          if (spentMin > total) usable = false;
          else pending = true;
        }
        continue;
      }
      // гибель бойца от **этой же** карты («Жертва»: «если она погибает от этого эффекта — получите
      // действие»): проверяется по остатку здоровья группы и урону, который карта ей наносит
      if (String(fact?.fact) === 'DEATH') {
        const params = fact.params ?? {};
        if (!(gene('lost', 1) > 0) || !deathPromised(state, playerId, ownCard, params)) {
          usable = false;
        }
        continue;
      }
      if (String(fact?.fact) !== 'COMBAT') {
        kept.push(fact);
        continue;
      }
      const params = fact.params ?? {};
      // скрытые числа боя: усиление карты и наличие у неё свойств. Читать их вправе только вскрытый бой
      // (границы те же, что у проекции: `reveal | resolve | close`), иначе решает оценка по остатку колоды
      const revealed = ['reveal', 'resolve', 'close'].includes(String(state?.combat?.stage));
      if (open && revealed) {
        kept.push(fact);
        continue;
      }
      if (params.bonus != null && params.bonus !== '') {
        if (!(gene('estimate', 1) > 0)) {
          usable = false;
          continue;
        }
        const side = String(params.bonus);
        let value = null;
        if (side === 'self') value = Math.max(0, num(ownCard?.bonus));
        else if (isOpponent(side)) {
          // `bonusValue` — исход распределения (`counting.js: bonusOutcomes`): весы Анубиса считают обе
          // половины по своим исходам, а не по одному среднему числу
          value = bonusValue == null ? expectedBonus(state, playerId) : Math.max(0, num(bonusValue));
        }
        if (value == null || !withinBounds(params, value, bound)) {
          usable = false;
          continue;
        }
        if (fact.var != null) bound[String(fact.var)] = value;
        continue;
      }
      if (params.effects != null && params.effects !== '') {
        if (!(gene('estimate', 1) > 0)) {
          usable = false;
          continue;
        }
        const side = String(params.effects);
        const min = Math.max(1, num(params.min) || 1);
        const share =
          side === 'self'
            ? (ownCard?.rules ?? []).length >= min
              ? 1
              : 0
            : expectedRuleShare(state, playerId, { min });
        if (share < 0.5) {
          usable = false;
          continue;
        }
        if (fact.var != null) bound[String(fact.var)] = min;
        continue;
      }
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

  if (!usable) return { ok: false, vars: {}, pending: false };
  const conditions = { when: strip(rule?.when), any: (rule?.any ?? []).map(strip) };
  if (!usable) return { ok: false, vars: {}, pending: false };
  const result = runConditions(state, conditions, { playerId, vars: bound });

  return { ok: result.ok, vars: result.vars, pending: result.ok && pending };
};

/**
 * Владелец бойца по id. Нужен там, где в списке цели смешаны свои и чужие: `FIGHTERS { withinOf }`
 * отдаёт всех, кто стоит в радиусе, не спрашивая сторону.
 */
const ownerOf = (state, fighterId) =>
  (state?.players ?? []).find(player =>
    (player.fighters ?? []).some(fighter => String(fighter.id) === String(fighterId)),
  );

/**
 * Урон или лечение списку бойцов. Сторона считается по владельцу каждого бойца, а не по тегу
 * переменной целиком: «Сжечь всех дотла» бьёт и своих, и чужих, и цена своей части не должна
 * прятаться за пользой чужой. Своему урон — цена, чужому — польза, лечение — наоборот.
 *
 * Цена **своего** урона ограничена остатком здоровья: духу с 1 hp от двух урона достаётся один, второй
 * сгорает впустую. Без этого «Сжечь всех дотла» при полной свите выглядела убыточной (каждый свой дух —
 * 2 в минус, хотя он живёт единицей).
 */
const listHealthWorth = (state, playerId, resolved) => {
  const delta = healthDelta(resolved);
  const ids = Array.isArray(resolved?.fighterIds) ? resolved.fighterIds : null;
  if (!delta || !ids?.length) return null;

  let value = 0;
  let cost = 0;
  for (const entry of ids) {
    const id = entry != null && typeof entry === 'object' ? (entry.fighterId ?? entry.id) : entry;
    if (id == null) continue;
    const owner = ownerOf(state, id);
    const mine = owner == null || String(owner.id) === String(playerId);
    if (mine) {
      if (delta > 0) value += delta;
      else {
        const hp = fighterHpOf(owner, id);
        cost += hp > 0 ? Math.min(Math.abs(delta), hp) : Math.abs(delta);
      }
    } else if (delta < 0) {
      value += 2 * Math.abs(delta);
    } else {
      cost += delta;
    }
  }

  return { value, cost };
};

/** Остаток здоровья бойца по id (0 — боец неизвестен: тогда цена урона считается «как написано»). */
const fighterHpOf = (owner, fighterId) =>
  (owner?.fighters ?? []).find(fighter => String(fighter.id) === String(fighterId))?.currentHp ?? 0;

/**
 * Сторона переменной `$picked` для правила, у которого нет `PICKED { is }`: цель приходит из окна,
 * открытого правилом эффекта. Сторону берём у факта, связавшего переменную (`FIGHTERS { side: 'self' }` —
 * свои), а по умолчанию считаем чужой: окна «выберите бойца противника» — обычное дело, «выберите своего»
 * пишут явно.
 */
const pickedSideGuess = (card, varName) => {
  for (const rule of card?.rules ?? []) {
    if (String(rule?.moment) !== 'effect') continue;
    for (const step of rule.then ?? []) {
      if (String(step.action) !== 'SET_TARGETING') continue;
      const refs = (Array.isArray(step.candidates) ? step.candidates : [step.candidates]).map(
        String,
      );
      if (!refs.includes(`$${varName}`)) continue;
      const fact = (rule.when ?? []).find(entry => String(entry?.var) === varName);
      const side = String(fact?.params?.side ?? '');
      if (side === 'self' || side === 'teammate') return side;
      return 'opponent';
    }
  }

  return 'opponent';
};

/**
 * Урон **на проходе** (`.docs/bot-strategies.md`, «Метель»): «каждый, через кого она прошла, получает 2
 * урона». Маршрута в момент оценки ещё нет, но видно, сколько чужих бойцов стоит в пределах бюджета
 * перемещения: столько их может оказаться на пути. Один враг уже оплачен в `actionWorth` (по пункту за
 * пункт урона), здесь — добавка за второго и третьего; больше двух не считаем, чтобы не оценивать карту
 * по всей доске.
 */
const movementPassWorth = (action, state, playerId, card) => {
  if (String(action?.action) !== 'SET_MOVEMENT') return 0;
  const damage = num(action.damageOnPass);
  if (!(damage > 0)) return 0;
  const budget = Math.max(1, num(action.budget) || 1);
  const mine = ((state?.players ?? []).find(player => String(player.id) === String(playerId))
    ?.fighters ?? []
  ).filter(
    fighter =>
      (Number(fighter.currentHp) || 0) > 0 &&
      fighter.currentPosition != null &&
      fighterMatchesCard(fighter, card ?? {}),
  );
  if (mine.length === 0) return 0;

  let most = 0;
  for (const fighter of mine) {
    const distances = cellDistances(state, fighter.currentPosition);
    let found = 0;
    for (const player of state.players ?? []) {
      if (String(player.id) === String(playerId)) continue;
      for (const foe of player.fighters ?? []) {
        if (foe.currentPosition == null || (Number(foe.currentHp) || 0) <= 0) continue;
        const distance = distances.get(String(foe.currentPosition));
        if (distance != null && distance > 0 && distance <= budget) found += 1;
      }
    }
    most = Math.max(most, found);
  }

  return Math.max(0, Math.min(2, most) - 1) * damage;
};

/**
 * **Ветка `picked`** (`.docs/bot-strategies.md`, «Ветка picked: урон, толчок, выбор варианта»). У эффектной
 * карты польза часто живёт не в правиле `effect` (оно только открывает окно), а в правилах `picked`:
 * «Ожог» (2 урона и толчок), «Три обещания» (лечение, добор или шаг с лавой), «Смена караула». Обещание
 * видело у них ноль, хотя карта без этих правил не играется. Берётся **лучший** вариант: карту играют
 * ради него, а какой из вариантов выбрать, решает то же окно.
 */
const pickedWorth = (card, context) => {
  let best = { value: 0, cost: 0 };
  const gainOf = worth => Number(worth?.value) - Number(worth?.cost);

  const ids = new Set();
  for (const rule of card?.rules ?? []) {
    if (String(rule?.moment) !== 'picked') continue;
    for (const id of pickedOptions(rule)) ids.add(id);
  }
  for (const id of ids) {
    const worth = optionWorth(card, id, context);
    if (gainOf(worth) > gainOf(best)) best = worth;
  }
  // правила `picked` без `is`: цель выбрана окном, сторона переменной — из факта, открывшего окно
  for (const rule of card?.rules ?? []) {
    if (String(rule?.moment) !== 'picked') continue;
    if (pickedOptions(rule).length > 0) continue;
    const sides = varSides(rule);
    for (const fact of rule.when ?? []) {
      const name = String(fact?.var ?? '');
      if (name === '' || sides[name] != null) continue;
      sides[name] = pickedSideGuess(card, name);
    }
    const worth = listWorth(rule.then, sides, context);
    if (gainOf(worth) > gainOf(best)) best = worth;
  }

  return best;
};

/**
 * Польза **эффектной** карты в этой позиции: сколько она сделает, если сыграть её сейчас.
 *
 * Ценность считается по правилам момента `effect` (сама карта, не бой): условия проверяет движок теми
 * же фактами, что и в партии, а результат оценивается той же шкалой, что варианты свойств (`listWorth`).
 * Сверх этого — лучший вариант ветки `picked` (`pickedWorth`): польза, ради которой карту и играют.
 *
 * `fires` — сколько правил карты выполнилось **сейчас**, по всем её моментам: это ответ на вопрос
 * «сработает ли свойство вообще». Эффектная карта, у которой `fires === 0`, не сделает ничего:
 * правила момента `effect` не выполняются, а `picked`/`duringCombat` без эффекта не наступают.
 * `known` — есть ли что проверять: карту без правил не наказываем, иначе новая механика в контенте
 * молча выпадала бы из игры.
 */
export const effectWorth = (card, state, playerId, { target = null, context = null } = {}) => {
  const cardRules = card?.rules ?? [];
  // контекст считается на решение и передаётся снаружи (`bot/play/decide.js`): зовётся это на каждую
  // карту каждого перечисления, а обход игроков в поиске недешёв
  const economy = context ?? handContext(state, playerId);
  let value = 0;
  let cost = 0;
  let fires = 0;
  // правила момента `effect` сработали — значит окно и ветка `picked` наступят
  let windows = 0;
  // по правилам: какие механики карты в этой позиции срабатывают, а какие молчат (счёт в `bot/play/metrics.js`)
  const ruleFires = [];

  for (const rule of cardRules) {
    // связывание переменных смотрит на карту целиком: правило карты «мои бойцы» проверяется по ней
    const checked = conditionsFor({ ...rule, card }, state, playerId, { target });
    // боевые моменты при объявлении ещё не наступили: `null` — «тут не считаем», а не «не сработало»
    ruleFires.push(String(rule?.moment) === 'effect' ? checked.ok : null);
    if (!checked.ok) continue;
    fires += 1;
    if (String(rule?.moment) !== 'effect') continue;
    windows += 1;

    const sides = varSides(rule);
    for (const action of rule.then ?? []) {
      let resolved = null;
      try {
        resolved = resolveVars({ ...action }, checked.vars);
      } catch {
        continue; // переменная правила пришла не из условий — обещать нечего
      }
      const worth =
        action.action === 'SET_HEALTH'
          ? (listHealthWorth(state, playerId, resolved) ??
            actionWorth(action, sides, resolved, economy))
          : actionWorth(action, sides, resolved, economy);
      value += worth.value ?? 0;
      cost += worth.cost ?? 0;
      // урон на проходе: сколько врагов может оказаться на маршруте (`movementPassWorth`)
      value += gene('pass', 1) > 0 ? movementPassWorth(action, state, playerId, card) : 0;
    }
  }
  if (windows > 0 && gene('picked', 1) > 0) {
    const picked = pickedWorth(card, economy);
    value += picked.value ?? 0;
    cost += picked.cost ?? 0;
  }

  return { value, cost, fires, known: cardRules.length > 0, ruleFires };
};

/**
 * Обещание карты: что её собственные правила добавляют к напечатанному числу **в этой позиции**.
 *
 * Условия проверяет сам движок (`runConditions`), а не пересказ текста карты: «Погребальный звон»
 * (4) становится 6, потому что его правило на `movedThisTurn` выполнено. До объявления боя факты
 * `COMBAT` проверить нечем, поэтому участники (`player`, `select`) подставляются целью, которую
 * политика выбрала заранее, — и только если бой ещё не открыт. Свойства, которых до расчёта не
 * существует (`winner`, `bonus`, `effects`), правило отменяют: обещать победу нельзя, а усиление чужой
 * карты бот не подглядывает — проекция отдаёт её владельцу карты, а не защитнику (§13). Исключение —
 * **оценка по остатку колоды** (`conditionsFor`): усиление и свойства чужой карты берутся средним по
 * невышедшим картам, поэтому весы Анубиса получают цену (`BOT_GENE_ESTIMATE=0` выключает).
 *
 * Возвращает `{ strength, worth, deferred }`: `strength` — **эффективное число** карты (замена `value`,
 * а не добавка к ней), `worth` — прочая польза в единицах этого модуля (сброс чужой карты, добор,
 * лечение), `deferred` — обещание, которое наступит **позже** в этом же ходу (номер действия ещё не
 * тот, `AP { spentMin }`): объявить карту сейчас — потерять его (`policy.js: attackWeight`).
 */
export const cardPromise = (
  card,
  state,
  playerId,
  { target = null, open = false, context = null } = {},
) => {
  let strength = attackStrength(card);
  let worth = 0;
  let deferred = 0;
  const economy = context ?? handContext(state, playerId);

  /**
   * Исходы скрытого усиления: если правило сравнивает **чужое** усиление (весы Анубиса), оно проверяется
   * для каждого возможного усиления из остатка колоды, а ценности взвешиваются вероятностями
   * (`counting.js: bonusOutcomes`). Иначе один исход — «усиление неизвестно, оценка не нужна».
   */
  const outcomesOf = rule => {
    if (!(gene('scales', 1) > 0)) return [{ chance: 1, bonus: null }];
    const estimated = (rule?.when ?? []).some(
      fact =>
        String(fact?.fact) === 'COMBAT' && estimatedBonusSide(fact?.params) === 'opponent',
    );

    return estimated ? bonusOutcomes(state, playerId) : [{ chance: 1, bonus: null }];
  };

  /** Обещание одного правила при заданном усилении чужой карты: `null` — правило не срабатывает. */
  const ruleValue = (rule, bonus) => {
    const checked = conditionsFor({ ...rule, card }, state, playerId, {
      target,
      open,
      bonusValue: bonus,
    });
    if (!checked.ok) return null;

    const sides = varSides(rule);
    let ruleWorth = 0;
    let ruleTo = 0;
    let rulePlus = 0;
    for (const action of rule.then ?? []) {
      let resolved = null;
      try {
        resolved = resolveVars({ ...action }, checked.vars);
      } catch {
        continue; // переменная правила пришла не из условий — обещать нечего
      }

      const side = sideOf(action, sides); // сторону считает исходное действие: в `$переменная` уже id
      const to = num(resolved.to);
      if (resolved.action === 'SET_COMBAT' && resolved.op === 'value' && !isOpponent(side)) {
        // «значение становится N» — замена числа; «значение +3» — прибавка к нему («Пепельная стая»
        // считает силу по числу духов: без ветки `delta` карта обещала 2 вместо 5)
        const delta = num(resolved.delta);
        if (to > 0) ruleTo = Math.max(ruleTo, to);
        else if (delta !== 0) rulePlus += delta;
        continue;
      }
      if (resolved.action === 'SET_HEALTH' && isOpponent(side) && healthDelta(resolved) < 0) {
        rulePlus += Math.abs(healthDelta(resolved));
        continue;
      }
      // сторону считает исходное действие: в подставленном `$переменная` уже стоит id игрока
      ruleWorth += actionWorth(action, sides, resolved, economy).value ?? 0;
    }

    return { worth: ruleWorth, to: ruleTo, plus: rulePlus, pending: checked.pending };
  };

  for (const rule of card?.rules ?? []) {
    if (!PROMISE_MOMENTS.has(String(rule?.moment))) continue;

    let ruleWorth = 0;
    let ruleTo = 0;
    let rulePlus = 0;
    let waiting = 0;
    let fired = false;
    for (const outcome of outcomesOf(rule)) {
      // `bonusOutcomes` отдаёт распределение `{ value, chance }`: `value` — усиление чужой карты
      const part = ruleValue(rule, outcome.bonus ?? outcome.value ?? null);
      if (part == null) continue;
      fired = true;
      if (part.pending) {
        // окно номера действия ещё не наступило: это обещание **следующего** действия, а не этого
        waiting += outcome.chance * part.worth;
        continue;
      }
      ruleWorth += outcome.chance * part.worth;
      ruleTo += outcome.chance * part.to;
      rulePlus += outcome.chance * part.plus;
    }
    if (!fired) continue;

    deferred += waiting;
    if (ruleTo > 0) strength = Math.max(strength, ruleTo);
    strength += rulePlus;
    worth += ruleWorth;
  }

  return { strength, worth, deferred };
};

/**
 * Метки карты: по ним видно, что сброс карты кормит ресурс героя (осколок Снежной королевы).
 */
export const cardTags = card => new Set((card?.tags ?? []).map(String));

/**
 * Стихии, которые читают правила карт в руке: «Три обещания» кладут лёд, «Пепельный ветер» ищет лаву.
 * Политике это подсказка, куда перепозиционироваться, чтобы карта сработала, — движок такого совета
 * не даёт, а игрок-человек видит связку «карта в руке ↔ земля под ногами» сразу (запрос владельца, m01705).
 */
export const handTerrains = cards => {
  const terrains = new Set();
  const scan = value => {
    if (value == null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(scan);
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'terrain') {
        for (const terrain of [entry].flat(2)) {
          if (typeof terrain === 'string' || typeof terrain === 'number')
            terrains.add(String(terrain));
        }
        continue;
      }
      scan(entry);
    }
  };
  for (const card of cards ?? []) scan(card?.rules ?? []);

  return terrains;
};
