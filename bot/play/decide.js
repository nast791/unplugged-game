import { runAction, runUi } from '#shared/publicApi.js';
import { cardIdOf } from './metrics.js';
import { cardTags, cardPromise, effectWorth, optionWorth } from './cards.js';
import { expectedAttack } from './counting.js';
import { planBudget, turnPlan } from './plan.js';
import { searchAction, searchBudget } from './search.js';
import { cardById, resourceTags, terrainAffinity } from './pool.js';
import {
  attackWeight,
  cardCostWeight,
  defenseWeight,
  drawWeight,
  holdWeight,
  movementWeight,
  optionWeight,
  targetWeight,
  weightsFor,
} from './policy.js';
import { PRIOR_MIX, SELECTION_TEMPERATURE, rankOptions, scoreOptions, valueOf } from './qvalue.js';
import { featuresOf } from './value.js';

/**
 * Выбор хода — ядро решений бота, **без серверных зависимостей**: здесь только то, что нужно, чтобы по
 * состоянию и id игрока получить список действий с весами и попросить поиск выбрать из них. Ни `server/`,
 * ни `node:` тут нет, поэтому этот же код работает и в браузере (`bot/play/ai.js` → клиент, режим `vs_ai`),
 * и в прогонах (`bot/play/duel.js`).
 *
 * Границы честности те же, что у живого игрока: список действий собирается по `runUi` (то, что движок
 * показывает клиенту), свои карты бот знает, чужие — только счётом (`bot/play/counting.js`).
 */
export const nextRandom = state => {
  state.value = (Math.imul(state.value, 1103515245) + 12345) >>> 0;
  return state.value / 0x100000000;
};

/** Взвешенный случайный выбор: нужен и прогону партии, и роллаутам поиска (`bot/play/search.js`). */
export const pickWeighted = (rng, options) => {
  // вес 0 — «не предлагаем»: иначе нулевой вариант мог выпасть первым и бот сходил бы в пустоту
  const usable = options.filter(entry => entry.weight > 0);
  const pool = usable.length > 0 ? usable : options;
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = nextRandom(rng) * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.action;
  }
  return pool[pool.length - 1].action;
};

/** Кто сейчас действует: пауза эффекта → окно цели → перемещение → защита → бой → активный игрок. */
export const actorOf = state => {
  if (state.hook === 'gameStart') {
    const waiting = (state.players ?? []).find(player => player.placementReady !== true);
    return waiting?.id ?? null;
  }
  if (state.combat?.choice) return state.combat.choice.playerId;
  if (state.targeting) return state.targeting.playerId;
  if (state.movement) return state.movement.playerId;
  if (state.combat?.stage === 'defense') return state.combat.defenderPlayerId;
  if (state.combat) return state.combat.attackerPlayerId;
  return state.turn?.playerId ?? null;
};

const fightersOf = (state, playerId) =>
  (state.players ?? []).find(player => String(player.id) === String(playerId))?.fighters ?? [];

const enemiesOf = (state, playerId) =>
  (state.players ?? [])
    .filter(player => String(player.id) !== String(playerId))
    .flatMap(player => player.fighters ?? [])
    .filter(fighter => fighter.currentPosition != null && fighter.currentHp > 0);

/**
 * Дистанции от клетки до всех клеток — одним обходом. `bfsDistance` считает один маршрут за вызов, а
 * правилу позиции нужны десятки: расстояние до врага, «достаёт ли он отсюда», «достаём ли мы». Замер
 * показал, что именно BFS съедает время перечисления (0,056 мс на 20 обходов против 0,014 мс на ход
 * движка), поэтому карта расстояний кэшируется по объекту карты и клетке отправления.
 */
const distanceCache = new WeakMap();

const distanceMap = (state, from) => {
  const nodes = state.map?.nodes;
  if (!Array.isArray(nodes) || from == null) return null;

  let perMap = distanceCache.get(nodes);
  if (!perMap) {
    perMap = new Map();
    distanceCache.set(nodes, perMap);
  }
  const key = String(from);
  const hit = perMap.get(key);
  if (hit) return hit;

  const distances = new Map();
  const queue = [[Number(from), 0]];
  distances.set(String(from), 0);
  while (queue.length > 0) {
    const [cellId, step] = queue.shift();
    const node = nodes.find(entry => String(entry.id) === String(cellId));
    for (const neighbour of node?.neighbors ?? []) {
      const next = String(neighbour);
      if (distances.has(next)) continue;
      distances.set(next, step + 1);
      queue.push([Number(neighbour), step + 1]);
    }
  }

  perMap.set(key, distances);
  return distances;
};

/** Дистанция между клетками через кэш карт: неизвестная клетка — бесконечность. */
const distanceBetween = (state, from, to) => {
  if (from == null || to == null) return Infinity;
  if (String(from) === String(to)) return 0;
  const distances = distanceMap(state, from);
  const value = distances?.get(String(to));
  return value == null ? Infinity : value;
};

/**
 * Дистанция до ближайшего врага по BFS (через кэш карт расстояний). Четвёртый аргумент `bfsDistance` —
 * предел шагов, а не «без предела»: с `null` условие `0 >= null` истинно, обход заканчивается сразу и
 * расстояние всегда `Infinity`. На этом бот двигался вслепую — шаг в сторону врага ничем не отличался
 * от шага в никуда.
 */
const distanceToNearestEnemy = (state, playerId, cellId) =>
  enemiesOf(state, playerId).reduce((best, enemy) => {
    const distance = distanceBetween(state, cellId, enemy.currentPosition);
    return distance < best ? distance : best;
  }, Infinity);

const playerOf = (state, playerId) =>
  (state.players ?? []).find(player => String(player.id) === String(playerId)) ?? null;

/**
 * Самый слабый враг, до которого бот достаёт **сейчас**: цель для сравнения карт атаки. Считается по
 * открытому полю — своя дальность (`attackRange`) и чужие бойцы, — а не по чужой руке. Отдаёт и
 * владельца бойца: правила вида «рука того самого оппонента» (`HAND { of: '$enemy' }`) проверяются
 * обещанием карты (`bot/play/cards.js`).
 */
const weakestReachable = (state, playerId) => {
  const own = fightersOf(state, playerId).filter(fighter => fighter.currentPosition != null);
  let best = null;

  for (const fighter of own) {
    const range = Number(fighter.attackRange) || 1;
    for (const enemy of enemiesOf(state, playerId)) {
      const distance = distanceBetween(state, fighter.currentPosition, enemy.currentPosition);
      if (distance > range) continue;
      const hp = Number(enemy.currentHp) || 0;
      if (best != null && hp >= best.hp) continue;
      best = {
        fighterId: String(enemy.id),
        playerId: ownerOfFighter(state, enemy.id),
        hp,
      };
    }
  }

  return best;
};

/** Игрок-владелец бойца: нужен правилам, которые читают чужую руку. */
const ownerOfFighter = (state, fighterId) =>
  (state.players ?? []).find(player =>
    (player.fighters ?? []).some(fighter => String(fighter.id) === String(fighterId)),
  )?.id ?? null;

/** Здоровье самого слабого врага, до которого бот достаёт (0 — никто не достаёт). */
const weakestReachableEnemy = (state, playerId) => weakestReachable(state, playerId)?.hp ?? 0;

/**
 * Своё определение карты или умения по `source` окна: карта могла уже уйти из зоны (объявлена в бою,
 * ушла в сброс), тогда её берём из реестра контента. Бот читает **свою** карту — как игрок, который
 * знает свою колоду; чужой руки он по-прежнему не видит.
 */
const sourceDefinition = (state, playerId, source) => {
  if (source == null) return null;
  const wanted = String(source);

  for (const zone of ['hand', 'deck', 'discard']) {
    const found = (playerOf(state, playerId)?.[zone]?.cards ?? []).find(
      card => String(card.instanceId ?? card.id) === wanted,
    );
    if (found) return found;
  }

  for (const combat of [state.combat, state.lastCombat]) {
    for (const card of [combat?.attackCard, combat?.defenseCard]) {
      if (card && String(card.instanceId ?? card.id) === wanted) return card;
    }
  }

  const skill = playerOf(state, playerId)?.skill;
  if (skill && String(skill.id) === wanted) return skill;

  return cardById(cardIdOf(wanted));
};

/** Сброс карты кормит ресурс героя (метка осколка Снежной королевы) — это вложение, а не трата. */
const fuelsResource = (card, tags) => {
  if (!card || tags.size === 0) return false;
  for (const tag of cardTags(card)) {
    if (tags.has(tag)) return true;
  }
  return false;
};

/**
 * Средняя сила карт атаки в своей руке и колоде: точка отсчёта для оценки карты в бою, поэтому
 * «сильная карта» — это сильная **для своей колоды**, а не вообще. Бот считает по своим картам — как
 * игрок, который знает свою колоду.
 */
const averageAttackStrength = (state, playerId) => {
  const player = playerOf(state, playerId);
  const cards = [...(player?.hand?.cards ?? []), ...(player?.deck?.cards ?? [])].filter(
    card => card.type === 'attack' || card.type === 'hybrid',
  );
  if (cards.length === 0) return 0;

  const total = cards.reduce((sum, card) => sum + Math.max(0, Number(card.value) || 0), 0);
  return total / cards.length;
};

/**
 * Чем защищаться: число объявленной карты, если оно уже открыто (граница та же, что у проекции —
 * `reveal | resolve | close`), иначе ожидание по остатку колоды соперника. Подглядывать в
 * `combat.attackValue` нельзя: проекция отдаёт его владельцу карты, а живой защитник числа не видит.
 */
const defenseThreat = (state, playerId) => {
  const revealed = ['reveal', 'resolve', 'close'].includes(state.combat?.stage);
  return revealed ? Number(state.combat.attackValue) || 0 : expectedAttack(state, playerId);
};

/** Действия на расстановке: поставить бойца на подсвеченную клетку либо подтвердить. */ const placementActions =
  (state, playerId) => {
    const options = [];

    for (const fighter of fightersOf(state, playerId)) {
      if (fighter.currentPosition != null) continue;
      const ui = runUi(state, playerId, { selectedFighterId: fighter.id });
      for (const cellId of ui.highlightedCellIds ?? []) {
        options.push({
          weight: 1,
          action: {
            type: 'PICK',
            kind: 'cell',
            id: Number(cellId),
            fighterId: fighter.id,
          },
        });
      }
    }

    const ui = runUi(state, playerId);
    if (ui.modals?.pickNumHero) {
      for (const fighter of fightersOf(state, playerId)) {
        if (fighter.type !== 'hero') continue;
        options.push({
          weight: 1,
          action: { type: 'PICK', kind: 'fighter', id: fighter.id },
        });
      }
    }
    if (ui.controls?.ok?.visible && ui.controls.ok.enabled) {
      options.push({ weight: 3, action: { type: 'UI_OK' } });
    }

    return options;
  };

/**
 * Кого двигать в открытом окне: список из окна, а `null` — «ходят все» — так окно открывает обычное
 * перемещение. Пропустить `null` нельзя: бот объявлял перемещение и сразу его заканчивал — 30% действий
 * уходило в «добор», а настоящих шагов было 1%.
 */
const movementFighters = (state, playerId, movement) => {
  const own = fightersOf(state, playerId).filter(fighter => fighter.currentPosition != null);
  if (movement.fighters == null) return own.map(fighter => fighter.id);

  const allowed = new Set(movement.fighters.map(String));
  return own.filter(fighter => allowed.has(String(fighter.id))).map(fighter => fighter.id);
};

/** Стихии клетки: стихия — строка или массив областей (`sharesArea`), поэтому приводим к списку. */
const terrainsOf = (state, cellId) => {
  const terrain = (state.map?.nodes ?? []).find(
    node => String(node.id) === String(cellId),
  )?.terrain;
  if (Array.isArray(terrain)) return terrain.map(String);
  return terrain == null ? [] : [String(terrain)];
};

/** Стоит ли клетка на «своей» стихии героя: стихии из паспорта против стихий клетки. */
const onAffinity = (state, cellId, affinity) => {
  if (affinity.size === 0 || cellId == null) return false;
  return terrainsOf(state, cellId).some(terrain => affinity.has(terrain));
};

/** Сколько врагов достаёт до клетки: их дальность против расстояния по кэшу карт. */
const threatenedBy = (state, playerId, cellId) =>
  enemiesOf(state, playerId).filter(
    enemy =>
      distanceBetween(state, cellId, enemy.currentPosition) <= (Number(enemy.attackRange) || 1),
  ).length;

/** Сколько врагов достаём мы с клетки своей дальностью. */
const reachFrom = (state, playerId, cellId, range) =>
  enemiesOf(state, playerId).filter(
    enemy => distanceBetween(state, cellId, enemy.currentPosition) <= range,
  ).length;

/**
 * Ходы в перемещении: шаги по подсвеченным клеткам и «закончить».
 *
 * Шаг оценивается по прогрессу **за маневр**, а не по соседней клетке: `step` — выходим на дистанцию
 * удара, `stepCloser` — подходим ближе, чем уже были в этом маневре, `stepIdle` — топтание на месте
 * (политики дают ему вес 0, то есть «не предлагаем»). Без сравнения с лучшим достигнутым бот ходил
 * туда-обратно: клетка «ближе к врагу» находится всегда, и один маневр набирал десятки шагов
 * (75 в разборе) — партия не заканчивалась.
 *
 * Позиция: если боец достаёт **дальше** ближайшего врага, шаг из-под его удара — это `away`
 * (кайтить может тот, у кого дальность больше). Шаг на свою стихию получает премию `terrain`,
 * а закончить маневр на выгодной позиции — премию `hold`.
 */
const movementActions = (state, playerId, movement, weights) => {
  const options = [];
  const affinity = new Set(terrainAffinity(playerOf(state, playerId)?.heroId));
  let usefulStep = false;
  let holdHere = false;

  for (const fighterId of movementFighters(state, playerId, movement)) {
    const fighter = fightersOf(state, playerId).find(
      entry => String(entry.id) === String(fighterId),
    );
    if (!fighter) continue;
    const ui = runUi(state, playerId, { selectedFighterId: fighterId });
    const range = Number(fighter.attackRange) || 1;

    // что уже достигнуто в этом маневре: старт и все клетки, куда боец успел встать
    const origin = movement.origins?.[String(fighterId)] ?? fighter.currentPosition;
    const visited = (movement.moves ?? [])
      .filter(move => String(move.fighterId) === String(fighterId))
      .map(move => Number(move.to));
    const best = [origin, ...visited].reduce(
      (value, cellId) => Math.min(value, distanceToNearestEnemy(state, playerId, cellId)),
      Infinity,
    );
    const inRange = best <= range;

    // выгодная позиция: по нам не достают, а мы оттуда бьём (или стоим на своей стихии)
    const here = fighter.currentPosition;
    const hereThreat = threatenedBy(state, playerId, here);
    if (
      (hereThreat === 0 && reachFrom(state, playerId, here, range) > 0) ||
      onAffinity(state, here, affinity)
    ) {
      holdHere = true;
    }

    for (const cellId of ui.highlightedCellIds ?? []) {
      const cell = Number(cellId);
      const distance = distanceToNearestEnemy(state, playerId, cell);
      const improves = !inRange && distance <= range;
      // выйти из-под удара: сейчас по нам достают, а с новой клетки — уже нет, и мы оттуда бьём.
      // Считаются **все** враги, а не ближайший: иначе бот кайтит помощника с дальностью 1 и
      // подставляется под героя с дальностью 3 (на этом поиск и зацикливался).
      const away =
        !improves &&
        hereThreat > 0 &&
        threatenedBy(state, playerId, cell) === 0 &&
        reachFrom(state, playerId, cell, range) > 0 &&
        distance > best;
      const closer = !inRange && !improves && !away && distance < best;
      const kind = improves ? 'step' : away ? 'away' : closer ? 'closer' : 'idle';
      const weight = movementWeight(weights, {
        kind,
        affinity: onAffinity(state, cell, affinity),
      });
      if (weight > 0) usefulStep = true;
      options.push({
        weight,
        action: {
          type: 'PICK',
          kind: 'cell',
          id: cell,
          fighterId: fighter.id,
        },
      });
    }
  }

  // завершить перемещение можно всегда
  if (runUi(state, playerId).controls?.ok?.enabled) {
    options.push({
      weight: holdWeight(weights, { useful: usefulStep, good: holdHere }),
      action: { type: 'UI_OK' },
    });
  }

  return options;
};

/**
 * Политики, которые выбирают действие **поиском** (`bot/play/search.js`): варианты перечисляются жадно,
 * а решение принимает поиск. Отличаются оценкой листа (`net`, `matchup`, `plain`) и приором корня
 * (`qprior` — подсказка от ученика, `bot/play/qvalue.js`). Список один на всех потребителей: по нему же
 * `bot/learn/export.js` решает, писать ли в дневник доли доигрываний.
 */
export const SEARCH_POLICIES = new Set([
  'search',
  'net',
  'matchup',
  'plain',
  'position',
  'qleaf',
  'qprior',
  'turn',
]);

/**
 * Политики, которые решают **ход целиком** (`bot/play/plan.js`): варианты — цепочки своих действий до
 * конца хода. Вне своего хода (защита в чужом бою) планировать нечего, и такая политика играет как
 * `search` — решение принимает поиск.
 */
export const PLAN_POLICIES = new Set(['chain']);

/**
 * Все действия, которые движок сейчас принимает от игрока (по данным `runUi`), с весами от политики.
 *
 * `search` — особая политика: она не расставляет веса, а перебирает действия поиском по детерминизациям
 * (`bot/play/search.js`). Поэтому перечисление идёт жадными весами (они задают порядок вариантов), а выбор
 * остаётся за поиском: выбранному действию вес 1, остальным 0.
 *
 * `qvalue` — политика обученного тренера (`bot/learn/export.js` → `trainer/` → `bot/play/qvalue.js`):
 * варианты перечисляются жадно, а веса переставляет модель, которая оценивает **пару** «состояние +
 * действие». Так играет то, что раньше жило только в замерах: ценность действия, а не позиции.
 */
/**
 * Продолжение глазами **самого ученика**: он смотрит на позицию после своего хода и отвечает на вопрос
 * «что я тут смогу» — мягкий максимум собственных оценок по своим же вариантам, а если ход уже не мой
 * (или вариантов нет) — его голова оценки позиции `V(s)`. Никакого поиска и никакого оракула: это его
 * собственный пересчёт на шаг вперёд, тот же, каким `bot/play/search.js: qvalueLeaf` пользуется на листе.
 */
const continuationValue = (state, playerId) => {
  let offered = [];
  try {
    offered = enumerateActions(state, playerId, { policy: 'greedy' }).filter(
      entry => Number(entry.weight) > 0,
    );
  } catch {
    offered = [];
  }

  const scores = offered.length > 0 ? scoreOptions(state, playerId, offered) : null;
  if (scores != null) {
    const values = offered.map(entry => scores.get(JSON.stringify(entry.action)) ?? 0);
    const best = Math.max(...values);
    const exp = values.map(value =>
      Math.exp((value - best) / Math.max(0.05, SELECTION_TEMPERATURE)),
    );
    const total = exp.reduce((sum, value) => sum + value, 0) || 1;
    return values.reduce((sum, value, index) => sum + value * (exp[index] / total), 0);
  }

  return valueOf(undefined, featuresOf(state, playerId));
};

/**
 * Во сколько раз пересчёт вперёд весомее прямой оценки действия (`QVALUE_LOOKAHEAD`).
 *
 * **Замер §31: своему же ученику пересчёт вперёд вредит.** `qdeep` против `greedy` при разном весе:
 * 0 — **54%** (это просто `qvalue` с примесью политики), 0,25 — 50%, 0,5 — 50%, 1 — 46%: монотонно хуже.
 * Причина: `Q(s, a)` различает варианты **внутри** решения, но будущую позицию оценивать не обучен —
 * там другое распределение, и подмешивание его головы `V(s)` портит уже настроенный выбор. По умолчанию 0;
 * механизм остаётся опцией для будущих проб, когда появится честная цель для оценки последствий.
 */
const LOOKAHEAD = 0;

const envLookahead = () => {
  const raw = typeof process !== 'undefined' ? process?.env?.QVALUE_LOOKAHEAD : null;
  const value = Number(raw);
  return raw == null || raw === '' || !Number.isFinite(value) ? null : value;
};

/**
 * Решение ученика **с пересчётом вперёд** (политика `qdeep`): прямая оценка действия плюс λ · «что я
 * получу после него» — тем же способом, что и на листе поиска. Это и есть «ученик сам считает наперёд и
 * думает»: без поиска, без оракула, только своими `Q(s, a)` и своей головой оценки позиции.
 */
const deepOptions = (state, playerId, options) => {
  const ranked = rankOptions(state, playerId, options);
  const look = envLookahead() ?? LOOKAHEAD;
  if (look <= 0) return ranked;

  const offered = ranked.filter(entry => Number(entry.weight) > 0);
  if (offered.length === 0) return ranked;

  const scores = new Map();
  for (const entry of offered) {
    const base = Number(entry.qvalue) || 0;
    let next = 0;
    try {
      next = continuationValue(runAction(state, { ...entry.action, playerId }), playerId);
    } catch {
      next = 0;
    }
    scores.set(JSON.stringify(entry.action), base + look * next);
  }

  const best = Math.max(...scores.values());
  const scale = Math.max(...offered.map(entry => Number(entry.weight) || 0)) || 1;
  const exp = offered.map(entry =>
    Math.exp(
      ((scores.get(JSON.stringify(entry.action)) ?? 0) - best) /
        Math.max(0.05, SELECTION_TEMPERATURE),
    ),
  );
  const total = exp.reduce((sum, value) => sum + value, 0) || 1;
  const byAction = new Map(
    offered.map((entry, index) => [
      JSON.stringify(entry.action),
      { weight: (exp[index] / total) * scale, qvalue: scores.get(JSON.stringify(entry.action)) },
    ]),
  );

  return ranked.map(entry => {
    const found = byAction.get(JSON.stringify(entry.action));
    return found == null ? { ...entry, weight: 0 } : { ...entry, ...found };
  });
};

/** Оценка позиции глазами самого ученика — его голова `V(s)`, в той же шкале, что исход (±1). */
const valueOfState = (state, playerId) => valueOf(undefined, featuresOf(state, playerId));

const envDepth = () => {
  const raw = typeof process !== 'undefined' ? process?.env?.QVALUE_DEPTH : null;
  const value = Number(raw);
  return raw == null || raw === '' || !Number.isFinite(value)
    ? null
    : Math.max(0, Math.trunc(value));
};

/** Сколько своих вариантов перебирать внутри пересчёта (на корне перебираются все). */
const THINK_BRANCH = 4;

/** Сколько лучших по модели вариантов уходит в пересчёт (`QVALUE_TOP`; 0 — думать по всем). */
const THINK_TOP = 3;

const envTop = () => {
  const raw = typeof process !== 'undefined' ? process?.env?.QVALUE_TOP : null;
  const value = Number(raw);
  return raw == null || raw === '' || !Number.isFinite(value)
    ? null
    : Math.max(0, Math.trunc(value));
};

/**
 * **Думанье ученика** (§32): пересчёт вперёд **в одной шкале** — его собственная оценка позиции `V(s)`.
 *
 * Прошлая версия (`qdeep`) складывала ранжирующий счёт `Q(s, a)` с оценкой будущего и от этого только
 * портилась. Здесь шкала одна: свои ходы — максимум, ответы соперника — минимум, лист — `V(s)`.
 * Глубина `depth` — это и есть «сколько он думает»: 0 — просто оценка позиции, 1 — свой ход и оценка
 * получившейся позиции, 2 — свой ход, ответ соперника и оценка, и так далее.
 *
 * Ветвление ограничено (`THINK_BRANCH` на внутренних своих узлах, у соперника берётся его сильнейший по
 * весам ход): без предела перебор растёт как степень и «думать дольше» станет невозможно.
 */
const thinkValue = (state, playerId, depth) => {
  if (state.hook === 'gameEnd') return String(state.winner) === String(playerId) ? 1 : -1;
  if (depth <= 0) return valueOfState(state, playerId);

  const actor = actorOf(state);
  if (actor == null) return valueOfState(state, playerId);
  const mine = String(actor) === String(playerId);

  let offered = [];
  try {
    offered = enumerateActions(state, actor, { policy: 'greedy' }).filter(
      entry => Number(entry.weight) > 0,
    );
  } catch {
    return valueOfState(state, playerId);
  }
  if (offered.length === 0) return valueOfState(state, playerId);

  // у соперника — его сильнейший по весам ход; у себя — свои сильнейшие, чтобы перебор не взрывался
  const ordered = offered
    .slice()
    .sort((left, right) => (Number(right.weight) || 0) - (Number(left.weight) || 0))
    .slice(0, mine ? THINK_BRANCH : 1);

  const values = [];
  for (const entry of ordered) {
    try {
      values.push(
        thinkValue(runAction(state, { ...entry.action, playerId: actor }), playerId, depth - 1),
      );
    } catch {
      /* нелегальный вариант в пересчёте пропускаем */
    }
  }
  if (values.length === 0) return valueOfState(state, playerId);
  return mine ? Math.max(...values) : Math.min(...values);
};

/**
 * Решение ученика: **сначала модель, потом думанье** (политика `qthink`).
 *
 * Ступень 1 — дешёвое ранжирование моделью `Q(s, a)` с примесью политики: это то, что уже играет 54%
 * против `greedy` (§29–§31). Ступень 2 — пересчёт вперёд (`thinkValue`) **только по верхушке** этого
 * списка (`QVALUE_TOP`, по умолчанию 3): думанье решает спор между уже хорошими вариантами, а не
 * подменяет выбор — в чистом `qthink` по всем вариантам оно давало 49% (глубже, но слабее).
 */
const thinkOptions = (state, playerId, options) => {
  const ranked = rankOptions(state, playerId, options);
  const depth = envDepth() ?? 1;
  const top = envTop() ?? THINK_TOP;
  const offered = ranked.filter(entry => Number(entry.weight) > 0);
  if (offered.length === 0) return ranked;

  const keyOf = entry => JSON.stringify(entry.action);
  const priorOf = entry => Math.log1p(Math.max(0, Number(entry.weight) || 0));

  // ступень 1: ранжирование моделью — из него берётся шортлист
  const base = new Map(
    offered.map(entry => [keyOf(entry), (Number(entry.qvalue) || 0) + PRIOR_MIX * priorOf(entry)]),
  );
  const shortlist =
    top > 0
      ? offered
          .slice()
          .sort((left, right) => base.get(keyOf(right)) - base.get(keyOf(left)))
          .slice(0, top)
      : offered;
  const inShortlist = new Set(shortlist.map(keyOf));

  // ступень 2: пересчёт вперёд только по шортлисту
  const scores = new Map(base);
  for (const entry of shortlist) {
    let value = -1;
    try {
      value = thinkValue(runAction(state, { ...entry.action, playerId }), playerId, depth);
    } catch {
      value = -1;
    }
    scores.set(keyOf(entry), value + 0.05 * priorOf(entry));
  }

  // варианты вне шортлиста выиграть не могут: модель уже сказала, что они хуже
  if (top > 0 && inShortlist.size < offered.length) {
    const worst = Math.min(...[...inShortlist].map(key => scores.get(key))) - 1;
    for (const entry of offered) {
      if (!inShortlist.has(keyOf(entry))) scores.set(keyOf(entry), worst);
    }
  }

  const best = Math.max(...offered.map(entry => scores.get(keyOf(entry))));
  const scale = Math.max(...offered.map(entry => Number(entry.weight) || 0)) || 1;
  const exp = offered.map(entry =>
    Math.exp((scores.get(keyOf(entry)) - best) / Math.max(0.05, SELECTION_TEMPERATURE)),
  );
  const total = exp.reduce((sum, value) => sum + value, 0) || 1;
  const byAction = new Map(
    offered.map((entry, index) => [
      keyOf(entry),
      { weight: (exp[index] / total) * scale, qvalue: scores.get(keyOf(entry)) },
    ]),
  );

  return ranked.map(entry => {
    const found = byAction.get(keyOf(entry));
    return found == null ? { ...entry, weight: 0 } : { ...entry, ...found };
  });
};

export const actionsFor = (
  state,
  playerId,
  { policy = 'random', style = 2, skipAllowed = false } = {},
) => {
  // `search`, `net`, `matchup`, `plain` и `qprior` — поиск; отличаются оценкой листа и приором корня.
  // `chain` — планировщик хода (`bot/play/plan.js`): варианты перечисляются так же, а решение — цепочка.
  const planning = PLAN_POLICIES.has(policy);
  const searching = SEARCH_POLICIES.has(policy) || planning;
  const ranked = policy === 'qvalue';
  const deep = policy === 'qdeep';
  const thinking = policy === 'qthink';
  const options = enumerateActions(state, playerId, {
    policy: searching || ranked || deep || thinking ? 'greedy' : policy,
    style,
    skipAllowed,
  });
  if (ranked) return rankOptions(state, playerId, options);
  if (deep) return deepOptions(state, playerId, options);
  if (thinking) return thinkOptions(state, playerId, options);
  if (!searching) return options;

  // поиск перебирает только те действия, которые политика действительно предлагает: вес 0 значит
  // «не предлагаем» (шаг в никуда, добор на пустой колоде), иначе поиск находил бы топтание выгодным
  const offered = options.filter(entry => entry.weight > 0);
  const candidates = offered.length > 0 ? offered : options;
  const entries = candidates.map(entry => ({ action: entry.action, weight: entry.weight }));

  // План на ход: лучшая цепочка своих действий до конца хода. `null` — планировать нечего (не мой ход:
  // защита в чужом бою), тогда решение принимает поиск, как раньше.
  if (planning) {
    const plan = turnPlan(state, playerId, entries, planBudget());
    if (plan?.action != null) {
      const chosen = JSON.stringify(plan.action);
      const rows = new Map((plan.rows ?? []).map(row => [row.key, row]));
      return options.map(entry => {
        const key = JSON.stringify(entry.action);
        const row = rows.get(key);
        return {
          ...entry,
          weight: key === chosen ? 1 : 0,
          value: row == null ? 0 : row.mean,
          plan: row?.plan?.length ?? 0,
        };
      });
    }
  }

  // `net` — тот же поиск, но с оценкой листа из обученной модели (`bot/play/value.js`), `matchup` — её
  // проекцией на пару «мой герой против этого соперника» (`bot/play/matchups.js`), `plain` — прежней
  // ручной формулой (§16) для замера вклада ресурса, помощников и покоя (§21), `qprior` — ручной лист с
  // приором корня от ученика (`bot/play/search.js: rootPriors`)
  const budget = { ...searchBudget() };
  if (policy === 'net' || policy === 'matchup' || policy === 'plain' || policy === 'position')
    budget.evaluation = policy;
  // `qleaf` — тот же поиск, но лист оценивает **ученик**: он делает в позиции свой лучший ход (1 шаг
  // пересчёта вперёд собственными `Q(s, a)`), а не считается ручной формулой
  if (policy === 'qleaf') budget.evaluation = 'qvalue';
  // `qprior` — ручной лист, но приор корня даёт ученик (`bot/play/search.js: rootPriors`)
  if (policy === 'qprior') budget.priorFrom = 'qvalue';
  // `turn` — тот же поиск, но лист ставится на границе хода: доигрываем свой ход целиком и ответ
  // соперника, а не первые `depth` шагов (`bot/play/search.js: rolloutScore`)
  if (policy === 'turn') {
    budget.turnEnd = true;
    budget.replyTurn = true;
    budget.depth = Math.max(budget.depth, 24);
  }

  const decision = searchAction(state, playerId, entries, budget);
  if (decision?.action == null) return options;

  const chosen = JSON.stringify(decision.action);
  // доли доигрываний отдаются наружу вместе с вариантами: дневник (`bot/learn/export.js`) пишет по ним
  // цель политики, и это то же решение, что сыграла партия, а не его повторный пересчёт
  const visits = new Map((decision.rows ?? []).map(row => [row.key, row.visits]));
  // средняя оценка варианта у корня поиска (`rows[].mean`) — это **ценность действия**, а не только
  // «сколько его перебирали»: по ней дневник пишет цель для каждого варианта, а не лишь для сыгранного
  const values = new Map((decision.rows ?? []).map(row => [row.key, row.mean]));
  return options.map(entry => {
    const key = JSON.stringify(entry.action);
    return {
      ...entry,
      weight: key === chosen ? 1 : 0,
      visits: Number(visits.get(key) ?? 0),
      value: values.has(key) ? Number(values.get(key)) : 0,
    };
  });
};

/**
 * Перечисление легальных действий с весами политики: перечисление — задача движка, выбор из него —
 * задача политики (`bot/play/policy.js`). Ситуация для политики собирается из **открытых** данных: своя рука
 * (`hand`), есть ли из чего добирать (`canDraw`), запас колоды (`fuel`), здоровье и тип чужих бойцов.
 */
const enumerateActions = (
  state,
  playerId,
  { policy = 'random', style = 2, skipAllowed = false } = {},
) => {
  if (state.hook === 'gameStart') return placementActions(state, playerId);

  const situation = {
    style,
    hand: playerCards(state, playerId).length,
    canDraw: canDrawCards(state, playerId),
    // запас колоды: она не перетасовывается, поэтому это число доборов до истощения
    fuel: deckSize(state, playerId),
    // запас колоды соперника — открытая информация (колода на столе), и это **часы партии**: у кого
    // колода кончится раньше, тот и получит истощение. По разнице запасов политика решает, тянуть
    // размен или давить (`trade`)
    rivalFuel: rivalDeckSize(state, playerId),
    // метки ресурса героя: сброс такой карты не трата, а вложение (осколки Снежной королевы)
    resourceTags: resourceTags(playerOf(state, playerId)?.heroId),
  };
  const ui = runUi(state, playerId);
  const pickWeight = () => weightsFor(policy, situation).pick;
  /** Вес клика по бойцу: свой — равный выбор атакующего, чужой — оценка цели. */
  const fighterPickWeight = (weights, fighterId) => {
    const found = fighterWithOwner(state, fighterId);
    if (!found || String(found.player.id) === String(playerId)) return weights.pick;
    return targetWeight(found.fighter, weights);
  };
  /**
   * Вес варианта свойства: считаем, что вариант даёт и чем платит, по **своей** карте, открывшей окно.
   * Вариант, который тратит ресурс и ничего не приносит, получает нулевой вес и не предлагается
   * (а если такими оказались все — `pickWeighted` вернётся ко всему списку, окно не зависнет).
   */
  const optionPickWeight = (weights, optionId) => {
    const source = state.targeting?.source ?? state.effect?.source ?? null;
    return optionWeight(optionWorth(sourceDefinition(state, playerId, source), optionId), weights);
  };

  // окно вариантов свойства: свойства используем. Отказ — только в «осторожных» прогонах
  // (`skipAllowed`): по умолчанию бот ничего не пропускает, иначе редкие эффекты не проверяются
  const choices = (ui.choices ?? []).filter(choice => !choice.disabled);
  if (choices.length > 0) {
    const weights = weightsFor(policy, situation);
    const options = choices.map(choice => ({
      weight: optionPickWeight(weights, choice.optionId),
      action: { type: 'PICK', kind: 'option', id: choice.optionId },
    }));
    if (skipAllowed && ui.controls?.ok?.visible && ui.controls.ok.enabled) {
      options.push({ weight: pickWeight(), action: { type: 'UI_OK' } });
    }
    return options;
  }

  // окно выбора цели (способность или эффект карты)
  const targeting = state.targeting;
  if (targeting && String(targeting.playerId) === String(playerId)) {
    const weights = weightsFor(policy, situation);
    const options = (targeting.candidates ?? []).map(candidate => ({
      weight:
        targeting.kind === 'fighters'
          ? fighterPickWeight(weights, candidate.fighterId)
          : targeting.kind === 'options'
            ? optionPickWeight(weights, candidate.optionId)
            : weights.pick,
      action:
        targeting.kind === 'cells'
          ? { type: 'PICK', kind: 'cell', id: Number(candidate.cellId) }
          : targeting.kind === 'options'
            ? { type: 'PICK', kind: 'option', id: candidate.optionId }
            : { type: 'PICK', kind: 'fighter', id: candidate.fighterId },
    }));
    if (skipAllowed && targeting.required !== true) {
      options.push({ weight: weights.pick, action: { type: 'UI_OK' } });
    }
    return options;
  }

  // пауза перемещения от эффекта
  if (state.movement && String(state.movement.playerId) === String(playerId)) {
    return movementActions(state, playerId, state.movement, weightsFor(policy, situation));
  }

  // пауза выбора карты в бою (усиление, сброс): карту тратят, поэтому уходит самая дешёвая
  if (state.combat?.choice) {
    const weights = weightsFor(policy, situation);
    const hand = playerCards(state, playerId);
    const options = (ui.playableCardIds ?? []).map(cardId => {
      const card = hand.find(entry => String(entry.instanceId ?? entry.id) === String(cardId));
      return {
        weight: cardCostWeight(card, weights, {
          fuels: fuelsResource(card, situation.resourceTags),
        }),
        action: { type: 'PICK', kind: 'card', id: cardId },
      };
    });
    if (skipAllowed && ui.controls?.ok?.enabled) {
      options.push({ weight: weights.pick, action: { type: 'UI_OK' } });
    }
    return options;
  }

  // Фаза защиты: играем карту или пасуем. Пас пропускает весь урон, карта защиты почти всегда его
  // уменьшает, поэтому `greedy` карту предпочитает. Пас и карты предлагаются оба — иначе фаззинг
  // не доходил бы до защиты картой вовсе. Карты сравниваются по числу: закрыть ожидаемое число и не
  // переплачивать силой. Число объявленной карты скрыто до вскрытия (проекция отдаёт его только
  // владельцу), поэтому берём ожидание по остатку колоды соперника — подсчёт карт, а не подгляд.
  if (state.combat?.stage === 'defense' && !state.targeting) {
    const weights = weightsFor(policy, situation);
    const cards = playerCards(state, playerId);
    const threat = defenseThreat(state, playerId);
    // обещание карты считается только политикой, которая его оплачивает (`condition`): у эталонов
    // и у роллаута поиска ген нулевой, поэтому лишних проверок условий там нет
    const promised = weights.condition ? cardPromise : null;
    const options = (ui.playableCardIds ?? []).map(cardId => {
      const card = cards.find(entry => String(entry.instanceId ?? entry.id) === String(cardId));
      const promise = promised ? promised(card, state, playerId, { open: true }) : null;
      return {
        weight: defenseWeight(card, weights, { threat, strength: promise?.strength }),
        action: { type: 'PICK', kind: 'card', id: cardId },
      };
    });
    if (ui.pickFighters) {
      for (const fighterId of ui.highlightedFighterIds ?? []) {
        options.push({
          weight: fighterPickWeight(weights, fighterId),
          action: { type: 'PICK', kind: 'fighter', id: fighterId },
        });
      }
    }
    if (ui.controls?.ok?.enabled) {
      options.push({ weight: weights.defendPass, action: { type: 'UI_OK' } });
    }
    return options;
  }

  // выбор атакующего или цели: фаза сама говорит, ждёт ли она клика по бойцу (highlighted — кандидаты)
  if (state.combat && !state.targeting) {
    const weights = weightsFor(policy, situation);
    const options = ui.pickFighters
      ? (ui.highlightedFighterIds ?? []).map(fighterId => ({
          weight: fighterPickWeight(weights, fighterId),
          action: { type: 'PICK', kind: 'fighter', id: fighterId },
        }))
      : [];
    // цель могла быть выбрана движком сама — тогда остаётся ждать защиту
    if (options.length === 0 && ui.controls?.ok?.enabled) {
      options.push({ weight: weights.pick, action: { type: 'UI_OK' } });
    }
    return options;
  }

  // обычный ход: бой, перемещение, эффектная карта, сброс руки, конец действия.
  // Есть чем ударить — бьём; нечем — идём сближаться (объявление перемещения тянет за собой добор).
  // Карты атаки сравниваются между собой: сильная карта бьёт больнее, но добивать слабого врага
  // выгоднее той картой, которой ровно хватает (`weakness`), — сила сверх нужной сгорает вместе с картой.
  const cards = playerCards(state, playerId);
  const isAttackCard = cardId =>
    cards.some(
      card =>
        String(card.instanceId ?? card.id) === String(cardId) &&
        (card.type === 'attack' || card.type === 'hybrid'),
    );
  const playable = ui.playableCardIds ?? [];
  const weights = weightsFor(policy, { ...situation, canAttack: playable.some(isAttackCard) });
  const reachable = weakestReachable(state, playerId);
  const weakness = reachable?.hp ?? 0;
  const average = averageAttackStrength(state, playerId);
  // «Погребальный звон» — 6, пока Анубис не двигался; целью проверки служит самый слабый враг в
  // дистанции: правила вида «если боец оппонента на песке» без неё проверить нечем
  const promised = weights.condition ? cardPromise : null;

  // Кто ударит и чем рискует: здоровье бойца, который сейчас может ударить (`reachable.fighterId`),
  // против **ожидания** чужой атаки — не подглядывая в чужую руку (`counting.js: expectedAttack`).
  const attackerHp = reachable?.hp ?? 0;
  const counterThreat = expectedAttack(state, playerId);
  // Материал: своё здоровье против чужого. Нужен, чтобы считать **цену ранения** в общей шкале, а не
  // только «переживу ли удар»: размен, где я отдаю больше, чем забираю, плох даже без риска смерти.
  const material = {
    mine: ownHp(state, playerId),
    theirs: rivalHp(state, playerId),
  };
  // Карты соперника в руке — открытая величина (рука на столе) и второй ресурс размена: пустая рука
  // значит «ударил — и он не ответит картой», полная — «удар встретят». По этому числу политика `trade`
  // решает, давить сейчас или подождать, пока рука опустеет (`tradeCards`, §38).
  const rivalHand = (state.players ?? [])
    .filter(player => String(player.id) !== String(playerId))
    .reduce((sum, player) => sum + (player.hand?.cards?.length ?? 0), 0);

  const options = playable.map(cardId => {
    const card = cards.find(entry => String(entry.instanceId ?? entry.id) === String(cardId));
    if (!isAttackCard(cardId)) {
      // эффектная карта играется за свою пользу **сейчас**: карта, у которой ни одно правило не
      // выполняется, сюда не попадает вовсе (вес 0 — вето, как у «шага в никуда»). Незнакомое
      // содержимое (`known: false`) остаётся нейтральным, чтобы новая механика не выпадала из игры.
      const worth = weights.effect
        ? effectWorth(card, state, playerId, { target: reachable })
        : null;
      const weight =
        worth?.known && worth.fires === 0
          ? 0
          : weights.card + (Number(weights.effect) || 0) * Math.max(0, worth?.value ?? 0);
      return { weight, action: { type: 'PICK', kind: 'card', id: cardId } };
    }

    const promise = promised ? promised(card, state, playerId, { target: reachable }) : null;
    return {
      weight: attackWeight(card, weights, {
        weakness,
        average,
        strength: promise?.strength,
        promise: promise?.worth,
        hp: attackerHp,
        threat: counterThreat,
        fuel: situation.fuel,
        rivalFuel: situation.rivalFuel,
        material,
        rivalHand,
      }),
      action: { type: 'PICK', kind: 'card', id: cardId },
    };
  });
  if (ui.deck?.clickable) {
    // добор = объявление перемещения; на исходе колоды он приближает истощение, поэтому вес считается
    options.push({
      weight: drawWeight(weights, situation),
      action: { type: 'PICK', kind: 'deck' },
    });
  }
  if (ui.controls?.ok?.visible && ui.controls.ok.enabled) {
    options.push({ weight: weights.pass, action: { type: 'UI_OK' } });
  }

  return options;
};

const playerCards = (state, playerId) =>
  (state.players ?? []).find(player => String(player.id) === String(playerId))?.hand?.cards ?? [];

/** Боец и его владелец по id: по владельцу отличаем свою цель (выбор атакующего) от чужой. */
const fighterWithOwner = (state, fighterId) => {
  for (const player of state.players ?? []) {
    const fighter = (player.fighters ?? []).find(entry => String(entry.id) === String(fighterId));
    if (fighter) return { player, fighter };
  }
  return null;
};

/** Запас колоды игрока: сброс топливом не считается — колода не перетасовывается. */
const deckSize = (state, playerId) => (playerOf(state, playerId)?.deck?.cards ?? []).length;

/** Своё здоровье на поле: сумма по всем бойцам, стоящим на карте. */
const ownHp = (state, playerId) =>
  fightersOf(state, playerId)
    .filter(fighter => fighter.currentPosition != null)
    .reduce((sum, fighter) => sum + (Number(fighter.currentHp) || 0), 0);

/**
 * «Материал» чужой стороны: здоровье героев плюс половина здоровья помощников (помощник гибнет с
 * одного-двух ударов, поэтому единица его здоровья дешевле). Число открытое — бойцы на столе видны
 * обоим, поэтому метрика остаётся честной.
 */
const rivalHp = (state, playerId) =>
  enemiesOf(state, playerId).reduce(
    (sum, fighter) => sum + (Number(fighter.currentHp) || 0) * (fighter.type === 'hero' ? 1 : 0.5),
    0,
  );

/**
 * Запас колоды соперника (всех чужих игроков): это те же часы партии, что и своя колода, и число
 * открытое — колода лежит на столе. Нужно политике, чтобы решать, тянуть размен или давить.
 */
const rivalDeckSize = (state, playerId) =>
  (state.players ?? [])
    .filter(player => String(player.id) !== String(playerId))
    .reduce((sum, player) => sum + (player.deck?.cards ?? []).length, 0);

/**
 * Есть ли из чего добирать: **только колода**. Сброс не перетасовывается (`shared/actions/cards.js`),
 * поэтому добор при пустой колоде — это 2 урона истощения главному герою, а не новая карта.
 */
const canDrawCards = (state, playerId) => deckSize(state, playerId) > 0;
