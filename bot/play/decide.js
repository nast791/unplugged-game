import { runAction, runUi } from '#shared/publicApi.js';
import { rules } from '#shared/constants/rules.js';
import { nodeAllTerrains, playerFightersPlaced } from '#shared/helpers/placement.js';
import {
  windowComplete as targetingComplete,
  windowPicked as targetingPicked,
} from '#shared/helpers/targeting.js';
import { cardIdOf } from './metrics.js';
import {
  cardTags,
  cardPromise,
  effectWorth,
  handContext,
  handTerrains,
  optionWorth,
} from './cards.js';
import { expectedAttack, cancelRiskOf } from './counting.js';
import { planBudget, turnPlan } from './plan.js';
import { searchAction, searchBudget } from './search.js';
import { exposureValue, foeRoomValue, guardValue, rearValue, routeBlockValue } from './actionFeatures.js';
import { occupiedCellIds } from '#shared/helpers/turn.js';
import { assistantImportance, cancelCardIds, cardById, resourceTags, terrainAffinity } from './pool.js';
import {
  attackWeight,
  attackerWeight,
  BODY_KEY,
  cardCostWeight,
  defenseWeight,
  drawWeight,
  banishWeight,
  gene,
  holdWeight,
  keepPrice,
  movementWeight,
  optionWeight,
  SWAP_BODY,
  SWAP_HERO,
  swapWeight,
  targetWeight,
  teleportWeight,
  weightsFor,
} from './policy.js';

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

/**
 * Кто сейчас действует: пауза эффекта → окно цели → перемещение → защита → бой → активный игрок.
 *
 * **Отдельный случай — расстановка.** Она идёт **одновременно** у всех сторон, поэтому очередью её не
 * описать: `actorOf` отдаёт первого неподтверждённого (в `vs_ai` это человек), а компьютер в это же
 * время доставляет своих — за кого играть, решает `placementActorOf`. Если бы поиск брал актёром
 * `actorOf`, он ходил бы чужими картами и падал на «боец не ваш».
 */
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

/**
 * Не доставил ли кто-то из **компьютеров** своих бойцов. Нужно там, где решение принимается вне очереди:
 * на расстановке слот играет сам, не дожидаясь чужого «ОК» (`app/composables/game/useGameAi.js`),
 * и поиск внутри такого решения обязан знать, что двигается именно этот слот.
 */
export const pendingPlacementAi = state =>
  (state?.players ?? [])
    .filter(player => String(player.control) === 'ai' && !playerFightersPlaced(player))
    .map(player => String(player.id))[0] ?? null;

/** Кто расставляет прямо сейчас: компьютер вне очереди, иначе — обычный действующий. */
export const placementActorOf = state =>
  state?.hook === 'gameStart' ? (pendingPlacementAi(state) ?? actorOf(state)) : actorOf(state);

const fightersOf = (state, playerId) =>
  (state.players ?? []).find(player => String(player.id) === String(playerId))?.fighters ?? [];

const enemiesOf = (state, playerId) =>
  (state.players ?? [])
    .filter(player => String(player.id) !== String(playerId))
    .flatMap(player => player.fighters ?? [])
    .filter(fighter => fighter.currentPosition != null && fighter.currentHp > 0);

/**
 * Переключатели кэшей для замера их вклада (§48): `BOT_CACHE_DIST=0`, `BOT_CACHE_UNSEEN=0` — и правка
 * меряется на тех же сидах, а не «на глаз».
 */
const env = typeof process === 'undefined' ? {} : (process.env ?? {});
const cacheOn = name => env[name] !== '0';

/**
 * Дистанции от клетки до всех клеток — одним обходом. `bfsDistance` считает один маршрут за вызов, а
 * правилу позиции нужны десятки: расстояние до врага, «достаёт ли он отсюда», «достаём ли мы». Замер
 * показал, что именно BFS съедает время перечисления (0,056 мс на 20 обходов против 0,014 мс на ход
 * движка), поэтому карта расстояний кэшируется по объекту карты и клетке отправления.
 *
 * §48: внутри обхода клетка искалась линейно (`nodes.find` по 112 клеткам **на каждом шаге**), поэтому
 * кэш работал вполсилы. Индекс «id → клетка» строится один раз на карту (`WeakMap` по массиву узлов,
 * который форк переиспользует).
 */
const distanceCache = new WeakMap();
const mapIndexCache = new WeakMap();

const mapIndexOf = nodes => {
  if (!Array.isArray(nodes)) return new Map();
  const hit = mapIndexCache.get(nodes);
  if (hit != null) return hit;
  const index = new Map(nodes.map(node => [String(node.id), node]));
  mapIndexCache.set(nodes, index);
  return index;
};

const distanceMap = (state, from) => {
  const nodes = state.map?.nodes;
  if (!Array.isArray(nodes) || from == null) return null;

  const index = mapIndexOf(nodes);
  const key = String(from);
  let perMap = null;
  if (cacheOn('BOT_CACHE_DIST')) {
    perMap = distanceCache.get(nodes);
    if (perMap == null) {
      perMap = new Map();
      distanceCache.set(nodes, perMap);
    }
    const hit = perMap.get(key);
    if (hit) return hit;
  }

  const distances = new Map();
  const queue = [[key, 0]];
  distances.set(key, 0);
  while (queue.length > 0) {
    const [cellId, step] = queue.shift();
    const node = index.get(cellId);
    for (const neighbour of node?.neighbors ?? []) {
      const next = String(neighbour);
      if (distances.has(next)) continue;
      distances.set(next, step + 1);
      queue.push([next, step + 1]);
    }
  }

  perMap?.set(key, distances);
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
      const ownerId = ownerOfFighter(state, enemy.id);
      const ownerHero = playerOf(state, ownerId)?.heroId;
      best = {
        fighterId: String(enemy.id),
        playerId: ownerId,
        hp,
        type: enemy.type,
        // чем заканчивать: герой — главная цель, важный помощник (Амат, ворона) — половина, тело — мелочь
        important: enemy.type === 'hero' ? 1 : assistantImportance(ownerHero, enemy.group),
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

/**
 * Боец, которого переносит окно клеток (карта-телепорт, «Немой приговор»): правило `picked` пишет перенос
 * (`SET_FIGHTER_CELL`, `cellId: '$picked'`), оттуда и берём бойца вместе с владельцем — свой уход и
 * **выселение врага** оцениваются по-разному (`cellPlacementWeight` против `banishWeight`).
 */
const cellWindowFighter = (state, playerId, targeting) => {
  const card = sourceDefinition(state, playerId, targeting?.source);
  const step = (card?.rules ?? [])
    .filter(rule => rule.moment === 'picked')
    .flatMap(rule => rule.then ?? [])
    .find(entry => entry.action === 'SET_FIGHTER_CELL' && String(entry.cellId ?? '') === '$picked');
  const wanted = String(step?.fighterId ?? '');
  if (wanted === '') return null;
  // боец из боя («Врата» ставит побеждённого на песок): карта ловит его переменной `$foe`, а сама цель
  // боя открыта публично (`combat`/`lastCombat.targetFighterId`)
  if (wanted.startsWith('$')) {
    const targetId = state.lastCombat?.targetFighterId ?? state.combat?.targetFighterId;
    return targetId == null ? null : fighterWithOwner(state, targetId);
  }

  const found =
    fighterWithOwner(state, wanted) ??
    (card?.fighter == null ? null : fighterWithOwner(state, String(card.fighter)));
  if (found) return found;

  return (
    fightersOf(state, playerId)
      .map(fighter => fighterWithOwner(state, fighter.id))
      .find(entry => entry && String(entry.fighter.id) === wanted) ?? null
  );
};

/**
 * Вес клетки для переноса своего бойца: тот же набор понятий, что у шага, но **другая цена** — перенос не
 * тратит маршрут, поэтому клетку оцениваем саму по себе (`teleportWeight`): выйти из-под удара можно и
 * без того, чтобы «доставать дальше» (мечнику это недоступно, а телепорту — нет), а срезанный путь
 * добавляет `shortcut`. Ноль не отдаём: обязательное окно с нулевыми весами иначе нечем закрыть.
 */
export const cellPlacementWeight = (state, playerId, fighter, cellId, weights) => {
  const cell = Number(cellId);
  const range = Number(fighter.attackRange) || 1;
  const here = fighter.currentPosition;
  const hereDistance = distanceToNearestEnemy(state, playerId, here);
  const distance = distanceToNearestEnemy(state, playerId, cell);
  const improves = !(hereDistance <= range) && distance <= range;
  // уход: сейчас по нам достают, с новой клетки — нет. Требования «бить оттуда» нет намеренно: у
  // телепорта нет пути, и бегство само по себе — выгода (иначе Снежная ворона не уходила из-под удара)
  const escape =
    threatenedBy(state, playerId, here) > 0 && threatenedBy(state, playerId, cell) === 0;
  const closer = !improves && !escape && distance < hereDistance;
  const kind = improves ? 'step' : escape ? 'away' : closer ? 'closer' : 'idle';
  const affinity = affinityOf(state, playerId);
  // перенос ставит бойца туда, где его и встретит чужой ход: под чужими стволами стоять невыгодно и
  // герою тоже (раньше штраф был только у хрупкого тела, и обмен отправлял Дороти под удар)
  const body = String(fighter.type) !== 'hero';

  return Math.max(
    0.01,
    teleportWeight(weights, {
      kind,
      affinity: onAffinity(state, cell, affinity),
      // перенос — разовое решение, а не цепочка шагов: перекрытие считаем по самой клетке и без самого
      // бойца в занятости (иначе «остаться на месте» ничего не стоит, а прирост шага нужен только шагу)
      guard: body ? guardValue(state, playerId, cell, { skip: fighter.id }) : 0,
      exposed: exposureValue(state, playerId, cell),
      shortcut: Math.max(0, hereDistance - distance),
    }),
  );
};

/**
 * Обмен местами двух бойцов (`SWAP_FIGHTERS`), открытый окном выбора: пара берётся из правила `picked`
 * карты или умения, а не из клика, поэтому обоим вариантам клика цена одна — выбирает не «на кого
 * нажать», а «меняться или нет». Обмен бесплатен, поэтому прирост позиции честно сравнивается с нулём.
 */
const swapPairOf = (state, playerId, targeting, candidateFighterId) => {
  const card = sourceDefinition(state, playerId, targeting?.source);
  const step = (card?.rules ?? [])
    .filter(rule => rule.moment === 'picked')
    .flatMap(rule => rule.then ?? [])
    .find(entry => entry.action === 'SWAP_FIGHTERS');
  if (step == null) return null;

  const mine = fightersOf(state, playerId);
  const resolve = value => {
    const wanted = String(value ?? '');
    if (wanted === '$picked' || wanted === '$foe' || wanted === '$target') {
      return fighterWithOwner(state, candidateFighterId)?.fighter ?? null;
    }
    return mine.find(fighter => String(fighter.id) === wanted) ?? null;
  };
  const a = resolve(step.a);
  const b = resolve(step.b);

  return a && b ? [a, b] : null;
};

/** Прирост позиции от обмена: вес обоих бойцов на чужих клетках минус вес на своих. */
/**
 * Прирост позиции от обмена — **взвешенный по типу бойца**: герой дороже помощника. Обмен меняет местами
 * двух своих, и «позиция» у них не равная валюта: герой решает партию, а тело помощника — расход. Поэтому
 * прирост считается по каждому бойцу отдельно и умножается на его вес (`SWAP_HERO` 2,5 / `SWAP_BODY` 0,5):
 * увезти Дороти из-под удара дороже, чем подставить Тото. `BOT_GENE_SWAPHERO=0` возвращает прежнюю
 * одностороннюю шкалу, где оба бойца весили одинаково.
 */
export const swapDelta = (state, playerId, weights, [a, b]) => {
  if (a.currentPosition == null || b.currentPosition == null) return 0;
  const asymmetric = gene('swaphero', Number(weights?.swaphero) ?? 1) > 0;
  const worthOf = fighter =>
    !asymmetric ? 1 : String(fighter.type) === 'hero' ? SWAP_HERO : SWAP_BODY;
  const moved = (first, second) =>
    worthOf(first) *
      (cellPlacementWeight(state, playerId, first, second.currentPosition, weights) -
        cellPlacementWeight(state, playerId, first, first.currentPosition, weights)) +
    worthOf(second) *
      (cellPlacementWeight(state, playerId, second, first.currentPosition, weights) -
        cellPlacementWeight(state, playerId, second, second.currentPosition, weights));

  return moved(a, b);
};

/**
 * Насколько выгодно выселить **чужого** бойца на клетку (перенос врага телепортом): под мои удары — да,
 * далеко от своего героя — да, на **свою** стихию врага — нет. Раньше такие окна весили `weights.pick`,
 * то есть врага ставили куда попало.
 */
export const banishValue = (state, playerId, foe, cellId) => {
  const cell = Number(cellId);
  const myReach = fightersOf(state, playerId).filter(
    fighter =>
      distanceBetween(state, cell, fighter.currentPosition) <= (Number(fighter.attackRange) || 1),
  ).length;
  const owner = fighterWithOwner(state, foe?.id);
  const theirHero = owner
    ? fightersOf(state, owner.player.id).find(fighter => fighter.type === 'hero')
    : null;
  const isolation =
    theirHero?.currentPosition == null
      ? 0
      : Math.min(3, distanceBetween(state, cell, theirHero.currentPosition));
  const theirAffinity = owner ? new Set(terrainAffinity(owner.player.heroId)) : new Set();
  const badForThem = onAffinity(state, cell, theirAffinity) ? -0.5 : 0;

  return myReach + isolation * 0.4 + badForThem;
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

/** Стихии клетки: постоянные и временные (дополнительный кусок до конца хода) — одним списком. */
const terrainsOf = (state, cellId) =>
  nodeAllTerrains((state.map?.nodes ?? []).find(node => String(node.id) === String(cellId)));

/**
 * «Своя земля» для шага: стихии паспорта героя **плюс** стихии, которые читают карты в руке (запрос
 * владельца, m01705: держишь карту от льда — выгодно перепозиционироваться на лёд). Второе — живое, а не
 * паспортное: карта уйдёт из руки, и подсказка уйдёт вместе с ней.
 */
const affinityOf = (state, playerId) => {
  const terrains = new Set(terrainAffinity(playerOf(state, playerId)?.heroId));
  if (gene('handterrain', 1) > 0) {
    for (const terrain of handTerrains(playerCards(state, playerId))) terrains.add(terrain);
  }

  return terrains;
};

/**
 * «Чужая земля»: стихии паспортов соперников — по ним бот видит клетку, которая кормит **их** карты
 * (`.docs/bot-strategies.md` п. 2 «б»). Стихии из их рук неизвестны (чужой руки бот не видит), поэтому
 * берётся паспорт пака: `terrainAffinity`.
 */
const foeAffinityOf = (state, playerId) => {
  const terrains = new Set();
  for (const player of state.players ?? []) {
    if (String(player.id) === String(playerId)) continue;
    for (const terrain of terrainAffinity(player.heroId)) terrains.add(terrain);
  }

  return terrains;
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

/** Ближе этого чужой герой считается подошедшим: тогда тело встаёт в проход (перекрытие пути). */
const HERO_ALERT = 3;

/**
 * Грозит ли что-то герою: 1 — чужой герой подошёл ближе `HERO_ALERT`, 0 — нет. Тело ставится в проход
 * только по этому сигналу: «блокировать» на пустой доске значит отказываться от боя и тянуть партию.
 */
const heroDanger = (state, playerId) => {
  const myHero = fightersOf(state, playerId).find(fighter => fighter.type === 'hero');
  if (myHero?.currentPosition == null) return 0;
  const nearest = enemiesOf(state, playerId)
    .filter(fighter => fighter.type === 'hero' && fighter.currentPosition != null)
    .reduce(
      (value, fighter) =>
        Math.min(value, distanceBetween(state, myHero.currentPosition, fighter.currentPosition)),
      Infinity,
    );

  return nearest <= HERO_ALERT ? 1 : 0;
};

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
/**
 * Ограничение на **отходы** бойца за один ход — предохранитель против «качелей» (дистанция 2 → 3 → 2
 * и обратно), когда обе стороны бесконечно выходят из-под удара и снова входят, а бой так и не начинается.
 *
 * Найдено замером §42: в серии `greedy` против `greedy` (пары Анубис — Снежная королева) 49 партий из
 * 1800 упирались в лимит шагов, и самая долгая кончалась на 419-м шаге — уже за лимитом 400. Разбор двух
 * таких партий показал, что **отходы тут почти не при чём** (в разобранной партии отход не предлагался ни
 * разу, вся возня — шаги `closer` на дистанцию 2 и «закончить маневр»), поэтому основным лечением стало
 * не это, а **поднятый лимит шагов** (`bot/play/duel.js`, 400 → 1200): партии не бесконечны, они просто
 * длинные, и после лимита их заканчивает истощение. Этот предохранитель оставлен как страховка от
 * буквальных вечных «качелей»: первый отход в ходу — как решила политика, каждый следующий — по цене
 * `ESCAPE_PENALTY` от предыдущей.
 *
 * Порог спасения: при здоровье ≤ `ESCAPE_CRITICAL` отход не ограничивается — раненый боец вправе убегать.
 */
const ESCAPE_LIMIT = 1;
const ESCAPE_PENALTY = 0.16;
const ESCAPE_CRITICAL = 4;
/** Здоровье, до которого помощник считается телом из прохода: под чужими стволами стоять незачем. */
const BODY_HARDY = 3;
/**
 * Сколько «шагов в никуда» (без смены дистанции) предлагать одному бойцу. Клетки без прироста перекрытия
 * не предлагаются вовсе, а из клеток с приростом остаются лучшие: иначе планировщику достаются сотни
 * равноценных вариантов на ход и он думает минутами (m02668).
 */
const IDLE_GUARD_CELLS = 2;

/**
 * Счётчики отходов и «что уже достигнуто» по бойцу **за ход**: ключ — сам объект бойца (он живёт, пока
 * не сменятся игрок и данные), значения — число предложенных отходов и лучшая достигнутая дистанция.
 *
 * Ход кончился — счётчики сбрасываются (в следующем ходу боец снова может уйти один раз). Окно
 * перемещения при этом переоткрывается на каждом шаге, поэтому «начало маневра» берём не из окна, а
 * один раз за ход — иначе счётчик успевал сброситься между шагами и предохранитель не видел бы серию.
 */
let escapes = new WeakMap();
let seenState = new WeakMap();
let lastTurn = -1;

/** Сбросить счётчики, если номер хода сменился. Вызывается на каждом перечислении действий. */
const noteTurn = state => {
  const index = Number(state?.turn?.index) || 0;
  if (index !== lastTurn) {
    lastTurn = index;
    escapes = new WeakMap();
    seenState = new WeakMap();
  }
};

/**
 * Множитель веса отхода: первый отход в ходу — как решено политикой, дальше — тем меньше, чем больше
 * боец уже убегал. Исключения: раненый боец и политика, которая отход не запрещает вовсе (`stepAway`
 * равен нулю — тогда боец и так не убегает, и множитель не нужен).
 */
const escapeFactor = (fighter, weights, hp) => {
  const base = Number(weights?.stepAway) || 0;
  if (base <= 0 || Number(hp) <= ESCAPE_CRITICAL) return 1;
  const count = escapes.get(fighter) ?? 0;
  return count <= ESCAPE_LIMIT ? 1 : ESCAPE_PENALTY ** (count - ESCAPE_LIMIT);
};

const movementActions = (state, playerId, movement, weights, { afterCard = false } = {}) => {
  noteTurn(state);
  const options = [];
  const affinity = affinityOf(state, playerId);
  // Чужая земля: стихии паспортов соперников (и карт в их руке бот не знает). Шаг на них — контроль поля
  // (`.docs/bot-strategies.md` п. 2 «б»): пока там стоит моё тело, карты соперника «от стихии» не работают
  // так свободно, а само тело перекрывает ему выгодную клетку.
  const foeAffinity = foeAffinityOf(state, playerId);
  // «Опасная дистанция» (п. 7) включается по часам партии: своя колода не тоньше чужой — спешить некуда, и
  // шаг в контакт без удара — потеря темпа; тоньше — наоборот, давить выгоднее, и штраф не нужен
  const clockOk = deckSize(state, playerId) >= rivalDeckSize(state, playerId);
  const lastAction = (Number(state.turn?.actionsLeft) || 0) <= 1;
  let usefulStep = false;
  let holdHere = false;

  for (const fighterId of movementFighters(state, playerId, movement)) {
    const fighter = fightersOf(state, playerId).find(
      entry => String(entry.id) === String(fighterId),
    );
    if (!fighter) continue;
    const ui = runUi(state, playerId, { selectedFighterId: fighterId });
    const range = Number(fighter.attackRange) || 1;
    // позиция тела: помощник — это в первую очередь перекрытие прохода к герою, а не «ещё один стрелок»;
    // хрупкому телу (2–3 hp) стоять под чужими стволами незачем. Герой ведёт себя как раньше
    const body = String(fighter.type) !== 'hero';
    const fragile = body && (Number(fighter.currentHp) || 0) <= BODY_HARDY;
    // перекрытие считаем **приростом**: шаг в проход стоит премии, а перетаптывание между равными
    // клетками прохода — ничего (иначе помощник кружил по коридору весь ход)
    const guardHere = body ? guardValue(state, playerId, fighter.currentPosition) : 0;
    // занятые клетки и признак транзита: на занятой клетке боец стоит только во время прохода,
    // и с неё обязан уйти любым шагом
    const takenCells = occupiedCellIds(state, fighter.id);
    const standingOnTaken = takenCells.has(String(fighter.currentPosition));
    // тело встаёт в проход только когда герою что-то грозит и тратить бойцу нечего: иначе помощник
    // перекрывает путь вместо боя, бой не начинается и партия тянется (m02668)
    const guardWanted =
      body &&
      guardHere <= 0 &&
      reachFrom(state, playerId, fighter.currentPosition, range) === 0 &&
      heroDanger(state, playerId) > 0;
    // приговорённый важный помощник (Амат при 2–3 hp, ворона) уходит в тыл: пока он жив, работает механика
    // пака, а стоящий под ударом он её теряет (`.docs/bot-strategies.md`, «Беречь Амат»)
    const fleeing =
      body &&
      (Number(fighter.currentHp) || 0) <= BODY_HARDY &&
      assistantImportance(playerOf(state, playerId)?.heroId, fighter.group) >= BODY_KEY;
    // теснота вокруг чужого героя считается один раз на бойца: клетка сравнивается с текущим полем
    const foeRoomNow = foeRoomValue(state, playerId, null, { skip: fighter.id });

    // что уже достигнуто **за ход**: начало первого маневра этого хода и все клетки, куда боец успел
    // встать. Один раз за ход фиксируем, дальше берём из памяти: окно движок переоткрывает на каждом шаге
    if (!seenState.has(fighter)) {
      seenState.set(fighter, {
        origin: movement.origins?.[String(fighterId)] ?? fighter.currentPosition,
        visited: (movement.moves ?? [])
          .filter(move => String(move.fighterId) === String(fighterId))
          .map(move => Number(move.to)),
      });
    }
    const seen = seenState.get(fighter);
    const best = [seen.origin, ...seen.visited].reduce(
      (value, cellId) => Math.min(value, distanceToNearestEnemy(state, playerId, cellId)),
      Infinity,
    );
    const inRange = best <= range;

    // выгодная позиция: по нам не достают, а мы оттуда бьём (или стоим на своей стихии)
    const here = fighter.currentPosition;
    const hereThreat = threatenedBy(state, playerId, here);
    let awaySteps = 0;
    if (
      (hereThreat === 0 && reachFrom(state, playerId, here, range) > 0) ||
      onAffinity(state, here, affinity)
    ) {
      holdHere = true;
    }

    const cells = [];
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
      // «качели» лечим здесь: отход, который боец делает не первый раз за ход, стоит почти ничего
      const shrink = kind === 'away' ? escapeFactor(fighter, weights, fighter.hp) : 1;
      // после своего удара в этом же ходу сближение дешевле: размен уже начат, догонять важнее,
      // чем отходить (ген `actionSecond`) — иначе бот бьёт и уходит вместо продолжения
      const pursuit =
        kind === 'closer' && afterCard
          ? 1 - Math.max(0, Math.min(0.9, gene('actionsecond', Number(weights?.actionSecond) || 0)))
          : 1;
      // перекрытие — только «занять проход», а не «перекладывать тело по коридору»: если боец уже
      // перекрывает путь, премии больше нет (иначе помощник кружит, партия не движется — m02668)
      const guardGain = guardWanted
        ? Math.max(0, guardValue(state, playerId, cell) - guardHere)
        : 0;
      // «шаг в никуда» на клетку, где боец уже был в этом окне, — это те же качели: назад-вперёд
      // бюджет не тратит (радиус считается от истока), и партия зацикливалась на двух клетках.
      const revisits = kind === 'idle' && (seen.visited.includes(cell) || cell === seen.origin);
      // Шаг на занятую клетку — это проход сквозь бойца. Он нужен боту только когда даёт удар
      // (kind 'step') или когда боец уже стоит на чужой клетке и обязан с неё уйти: остальные заходы
      // на чужую клетку — качели «встал-вернулся», из-за них поиск раздувался и партия не двигалась.
      const occupiedAhead = takenCells.has(String(cell));
      const transitBack = occupiedAhead && seen.visited.includes(cell);
      // Бот по умолчанию сквозь занятые клетки не ходит: движок и человек это умеют, а поиск на таких
      // вариантах раздувается (партия с Дороти 23 → 60 с, замер по героям — в разы дольше).
      // Ген `transitpass` включает поведение обратно, чтобы сравнить замером.
      const transitWanted = gene('transitpass', 0) > 0 && (standingOnTaken || kind === 'step');
      const noProgress = revisits || transitBack || (occupiedAhead && !transitWanted);
      // опасная дистанция (п. 7): шаг в контакт, из которого не бьём, — а враг оттуда достаёт
      const contactNoAttack =
        !body &&
        lastAction &&
        clockOk &&
        kind !== 'step' &&
        kind !== 'away' &&
        reachFrom(state, playerId, cell, range) === 0 &&
        threatenedBy(state, playerId, cell) > 0;
      const weight = noProgress
        ? 0
        : movementWeight(weights, {
            kind,
            affinity: onAffinity(state, cell, affinity),
            guard: guardGain,
            exposed: fragile ? exposureValue(state, playerId, cell) : 0,
            noAttack: contactNoAttack,
            // чужая стихия: встать туда, где играет соперник, и перекрыть ему выгодную клетку
            foeTerrain: onAffinity(state, cell, foeAffinity) && !onAffinity(state, cell, affinity),
            // перекрыть кратчайший путь чужого героя к моему дешёвому бойцу (п. 2 «б»)
            foeRoute: body ? routeBlockValue(state, playerId, cell) : 0,
            // закрыть выход из тупика чужому герою (п. 8) — шаг ценится приростом тесноты
            foeRoom: Math.max(0, foeRoomNow - foeRoomValue(state, playerId, cell, { skip: fighter.id })),
            // отход в тыл приговорённому важному помощнику
            flee: fleeing ? rearValue(state, playerId, fighter.currentPosition, cell) : 0,
          }) *
          shrink *
          pursuit;
      if (weight > 0) usefulStep = true;
      if (kind === 'away' && weight > 0) {
        // отход реально предложен — считаем его бойцу: следующий в этом же ходу будет стоить копейки
        awaySteps += 1;
        if (!seen.visited.includes(cell)) seen.visited.push(cell);
      }
      cells.push({
        kind,
        gain: guardGain,
        weight,
        action: {
          type: 'PICK',
          kind: 'cell',
          id: cell,
          fighterId: fighter.id,
        },
      });
    }

    // шаг «в никуда» без прироста перекрытия не предлагаем: это не ход, а топтание на месте, и именно оно
    // раздувало перечисление (m02668). Из клеток с приростом оставляем лучшие `IDLE_GUARD_CELLS`
    const idle = cells
      .filter(entry => entry.kind === 'idle' && entry.gain > 0)
      .sort((left, right) => right.weight - left.weight)
      .slice(0, IDLE_GUARD_CELLS);
    for (const entry of cells) {
      if (entry.kind !== 'idle') options.push({ weight: entry.weight, action: entry.action });
    }
    for (const entry of idle) options.push({ weight: entry.weight, action: entry.action });
    // ход всё равно обязан быть: если кроме «топтания» движок ничего не подсветил, предлагаем лучшую из
    // этих клеток — иначе окно остаётся без вариантов и партия встаёт (на этом матрица дала deadlock)
    if (options.length === 0 && cells.length > 0) {
      const fallback = cells.reduce((leader, entry) =>
        entry.weight > leader.weight ? entry : leader,
      );
      options.push({ weight: Math.max(fallback.weight, 0), action: fallback.action });
    }

    if (awaySteps > 0) escapes.set(fighter, (escapes.get(fighter) ?? 0) + 1);
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
 * а решение принимает поиск. Отличаются оценкой листа (`net`, `matchup`, `plain`, `position`).
 */
export const SEARCH_POLICIES = new Set([
  'search',
  'spair',
  'srep',
  'sdedup',
  'sworld',
  'net',
  'matchup',
  'plain',
  'position',
  'turn',
]);

/**
 * Политики, которые решают **ход целиком** (`bot/play/plan.js`): варианты — цепочки своих действий до
 * конца хода. Вне своего хода (защита в чужом бою) планировать нечего, и такая политика играет как
 * `search` — решение принимает поиск.
 */
export const PLAN_POLICIES = new Set(['chain']);

/**
 * Политика, которой **перечисляются** варианты игры: она расставляет веса, а решение потом принимает
 * поиск или планировщик. Одна на рантайм и замеры — это условие честности: вес варианта и его порядок
 * должны быть одни и те же в браузере (`bot/play/ai.js`) и в прогонах (`bot/play/duel.js`).
 */
export const PROPOSER_POLICY = 'trade';

/**
 * Кем перечисляются варианты для политики `policy`: своя политика, если она сама расставляет веса
 * (`greedy`, `trade`, …), иначе — предлагатель рантайма. Так перечисление в браузере и в прогонах
 * совпадает.
 */
export const proposalPolicy = policy =>
  SEARCH_POLICIES.has(policy) || PLAN_POLICIES.has(policy) ? PROPOSER_POLICY : policy;

export const actionsFor = (
  state,
  playerId,
  { policy = 'random', style = 2, skipAllowed = false } = {},
) => {
  // `search`, `net`, `matchup`, `plain` и `position` — поиск; отличаются оценкой листа.
  // `chain` — планировщик хода (`bot/play/plan.js`): варианты перечисляются так же, а решение — цепочка.
  const planning = PLAN_POLICIES.has(policy);
  const searching = SEARCH_POLICIES.has(policy) || planning;
  // Перечисление — **одно на рантайм и замеры** (`proposalPolicy`): у поиска и планировщика веса
  // вариантов задаёт предлагатель рантайма (`trade`), а решение принимают они сами.
  const options = enumerateActions(state, playerId, {
    policy: proposalPolicy(policy),
    style,
    skipAllowed,
  });
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
  // ручной формулой (§16) для замера вклада ресурса, помощников и покоя (§21)
  const budget = { ...searchBudget() };
  if (policy === 'net' || policy === 'matchup' || policy === 'plain' || policy === 'position')
    budget.evaluation = policy;
  /**
   * `spair` — тот же поиск, но решение корня уточняется **парной переоценкой** (§52): раскрытые варианты
   * считаются в одних и тех же мирах (`bot/play/search.js: paired`). Отдельная политика, а не переменная
   * среды, нужна для честного матча «с механизмом против без»: настройка среды задала бы её **обеим**
   * сторонам партии, и сравнивать было бы нечего.
   */
  if (policy === 'spair' && budget.paired <= 0) budget.paired = 8;
  /**
   * `srep` — тот же поиск с **кэшем повторных миров** (§53): разные ходы корня часто ведут в одно и то же
   * состояние (замер: 49% доигрываний корня — повтор), и доигрывать его второй раз незачем. Отдельное имя
   * по той же причине, что у `spair`: переменная среды задала бы кэш обеим сторонам матча.
   */
  if (policy === 'srep') budget.repeat = true;
  /**
   * `sdedup` — поиск, который **схлопывает варианты, ведущие в одно состояние** (§53): у копий не
   * появляется отдельного узла корня, и визиты не делятся между неразличимыми записями.
   */
  if (policy === 'sdedup') budget.dedup = true;
  /**
   * `sworld` — поиск на **пуле миров** (§54): миры набираются один раз на решение и берутся по кругу,
   * поэтому разница между вариантами не тонет в разнице чужих рук. Каждое доигрывание свежее — в
   * отличие от кэша оценок (§53), который врал статистикой.
   */
  if (policy === 'sworld' && !(Number(budget.worldPool) > 0)) budget.worldPool = 8;
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
  // доли доигрываний отдаются наружу вместе с вариантами: это то же решение, что сыграла партия,
  // а не его повторный пересчёт
  const visits = new Map((decision.rows ?? []).map(row => [row.key, row.visits]));
  // средняя оценка варианта у корня поиска (`rows[].mean`) — это **ценность действия**, а не только
  // «сколько его перебирали»
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
 * Перечисление легальных действий с весов политики: перечисление — задача движка, выбор из него —
 * задача политики (`bot/play/policy.js`). Ситуация для политики собирается из **открытых** данных: своя рука
 * (`hand`), есть ли из чего добирать (`canDraw`), запас колоды (`fuel`), здоровье и тип чужих бойцов.
 *
 * §48: кэш перечисления по объекту состояния **пробовали и убрали** — замер на тех же сидах
 * (`.workbuddy/search-bench.mjs`, 4 прогона на режим, мс на решение) дал с кэшем 22,3–26,1 против
 * 20,1–23,7 без него, то есть кэш **вредит**: перечисление вызывается на состоянии дважды (корень), но
 * накладные расходы `WeakMap` + `Map` на каждое из тысяч состояний доигрывания дороже самого повтора.
 * Поэтому кэша здесь нет — это записанный результат, а не забытая оптимизация.
 */
const enumerateActions = (
  state,
  playerId,
  { policy = 'random', style = 2, skipAllowed = false } = {},
) => {
  if (state.hook === 'gameStart') return placementActions(state, playerId);

  // Итог битвы ждёт кнопки «Закрыть»: без неё действие не закончено и ход не передаётся — закрываем
  if (state.awaitingBattleClose != null) {
    return [{ weight: 1, action: { type: 'UI_CLOSE_BATTLE' } }];
  }

  const situation = {
    style,
    hand: playerCards(state, playerId).length,
    // лимит руки берётся у игрока: умение его понижает (у Снежной королевы до 5), а добор сверх лимита
    // в конце хода уходит в сброс — это та же сожжённая карта колоды (`drawWeight`, ген `choke`)
    handLimit: Number(playerOf(state, playerId)?.handLimit) || rules.maxHandSize,
    canDraw: canDrawCards(state, playerId),
    // запас колоды: она не перетасовывается, поэтому это число доборов до истощения
    fuel: deckSize(state, playerId),
    // запас колоды соперника — открытая информация (колода на столе), и это **часы партии**: у кого
    // колода кончится раньше, тот и получит истощение. По разнице запасов политика решает, тянуть
    // размен или давить (`trade`)
    rivalFuel: rivalDeckSize(state, playerId),
    // метки ресурса героя: сброс такой карты не трата, а вложение (осколки Снежной королевы)
    resourceTags: resourceTags(playerOf(state, playerId)?.heroId),
    // признак 'round' — это номер хода (`turn.index`, ходы считаются сквозь всю партию), а не `state.round`:
    // у движка `round` растёт раз в круг, а признак назван 'round' исторически (имя менять нельзя — на нём
    // обученные артефакты и тренер). Часы не только по колодам, но и по самой партии: на затянувшемся
    // ходу политика перестаёт откладывать бой (`tempo`, §43)
    round: Number(state.turn?.index) || 0,
    // действий осталось в этом ходу: первое и последнее действие стоят по-разному (`lastAction`, §43).
    // Движок умеет и больше двух (карты добавляют действия), поэтому берём число, а не флаг
    actionsLeft: Number(state.turn?.actionsLeft) || 0,
    // бой уже был в этой партии? `lastCombat` заполняется при закрытии боя — по нему видно, тянется ли
    // партия без боя (`deal`, §43)
    inFight: state.lastCombat != null,
  };
  const ui = runUi(state, playerId);
  // экономика руки считается один раз на решение: добор оценивается по тому, сколько карт влезает в лимит,
  // а зовётся это на каждую карту каждого перечисления (в том числе в доигрываниях поиска)
  const economy = handContext(state, playerId);
  // запас защит кладём в ситуацию: от него зависит вес атаки гибридом (`policy.js: stockFactor`)
  situation.defenseStock = economy.defenses + economy.deckDefenses;
  const pickWeight = () => weightsFor(policy, situation).pick;
  /**
   * Вес клика по бойцу: чужой — оценка цели, свой — равно (`pick`). `attacker` включает выбор **своего**
   * атакующего, где свои не равны: полного посылают охотнее, важного помощника в размен не отдают
   * (`attackerWeight`, ген `attackers`). Флаг включается только в окне выбора атакующего: в окне выбора
   * цели или в окне свойства свои бойцы выбираются по делу, и «здоровее — охотнее» там неверно.
   */
  const fighterPickWeight = (weights, fighterId, { attacker = false } = {}) => {
    const found = fighterWithOwner(state, fighterId);
    if (!found) return weights.pick;
    if (String(found.player.id) === String(playerId)) {
      if (!attacker) return weights.pick;
      const owner = playerOf(state, playerId)?.heroId;
      return attackerWeight(weights, found.fighter, {
        importance: assistantImportance(owner, found.fighter.group),
      });
    }
    return targetWeight(found.fighter, weights);
  };
  /**
   * Вес варианта свойства: считаем, что вариант даёт и чем платит, по **своей** карте, открывшей окно.
   * Вариант, который тратит ресурс и ничего не приносит, получает нулевой вес и не предлагается
   * (а если такими оказались все — `pickWeighted` вернётся ко всему списку, окно не зависнет).
   *
   * `choice` — сам вариант: у окна «посмотрите руку противника и выберите карту» варианты — **чужие**
   * карты, и выбирать надо ту, что дороже сопернику, а не первую (`foecard`, Снежная королева). У окна
   * «посмотрите две верхние карты колоды и возьмите одну» («Суд молчит» Анубиса) варианты — свои карты
   * из колоды, и там тоже решает ценность карты, а не порядок в списке.
   */
  const optionPickWeight = (weights, choice) => {
    const source = state.targeting?.source ?? state.effect?.source ?? null;
    // экономика руки: вариант с добором при полной руке сжигает карту колоды, а не играет её
    const base = optionWeight(
      optionWorth(sourceDefinition(state, playerId, source), choice?.optionId, economy),
      weights,
    );
    const power = gene('foecard', Number(weights?.foecard) || 0);
    if (!(power > 0) || choice == null) return base;
    if (choice.value == null && choice.bonus == null) return base;
    const zone = String(choice.zone ?? '');
    const mine = String(choice.ownerId ?? '') === String(playerId);
    // чужая рука — выбить самую дорогую; своя колода — взять самую дорогую
    if (!(zone === 'deck' && mine) && !(zone === 'hand' && !mine)) return base;
    const worth = Math.max(0, Number(choice.value) || 0) + Math.max(0, Number(choice.bonus) || 0);

    return base * (1 + power * Math.min(1, worth / 8));
  };

  // окно вариантов свойства: свойства используем. Список вариантов берём из `ui.choices` (его отдаёт
  // фаза боя), а если его нет — из кандидатов самого окна (так окно эффектной карты видно в фазе хода).
  // Клик по варианту только **отмечает** его: выбор применяет общая кнопка (`UI_OK`), поэтому отмеченный
  // вариант подтверждаем — иначе бот отмечал бы его по кругу и свойство не срабатывало бы вовсе.
  // У окна на несколько целей кнопка доступна только с полным набором: остальные варианты добираем кликами.
  const optionWindow = state.targeting;
  const uiChoices = ui.choices ?? [];
  const optionCandidates =
    uiChoices.length > 0
      ? uiChoices
      : String(optionWindow?.playerId) === String(playerId) && optionWindow?.kind === 'options'
        ? (optionWindow.candidates ?? [])
        : [];
  const optionChoices = optionCandidates.filter(choice => !choice.disabled);
  if (optionChoices.length > 0) {
    const weights = weightsFor(policy, situation);
    const marked = targetingPicked(optionWindow);
    if (marked.length > 0 && targetingComplete(optionWindow)) {
      return [{ weight: pickWeight(), action: { type: 'UI_OK' } }];
    }
    const options = optionChoices
      .filter(choice => !marked.includes(String(choice.optionId)))
      .map(choice => ({
        weight: optionPickWeight(weights, choice),
        // в паузе боя карта из руки — это выбор карты (`kind: 'card'`), а окно вариантов свойства
        // по-прежнему отмечает вариант (`kind: 'option'`)
        action: {
          type: 'PICK',
          kind: state.combat?.choice && choice.zone === 'hand' ? 'card' : 'option',
          id: choice.optionId,
        },
      }));
    // без отметки общая кнопка — это отказ от необязательного свойства (или закрытие неполного набора):
    // его берём только в «осторожных» прогонах, а подтверждение готового выбора всегда доступно
    if (skipAllowed && ui.controls?.ok?.visible && ui.controls.ok.enabled) {
      options.push({ weight: pickWeight(), action: { type: 'UI_OK' } });
    }
    return options;
  }

  // окно выбора цели (способность или эффект карты)
  const targeting = state.targeting;
  if (targeting && String(targeting.playerId) === String(playerId)) {
    const weights = weightsFor(policy, situation);
    const marked = targetingPicked(targeting);
    // окно клеток, которое переносит бойца: свой — клетка как позиция, чужой — выселение под удар
    const moved = targeting.kind === 'cells' ? cellWindowFighter(state, playerId, targeting) : null;
    const mine = moved && String(moved.player.id) === String(playerId) ? moved.fighter : null;
    const foe = moved && mine == null ? moved.fighter : null;
    // обмен местами (умение Дороти, «Тото отвлекает»): цена одна на оба клика, решает «меняться ли»
    const swap =
      targeting.kind === 'fighters' ? swapPairOf(state, playerId, targeting, null) : null;
    /** Отметка кандидата ключом окна: у клеток cellId, у вариантов optionId, иначе fighterId. */
    const candidateId = candidate =>
      String(
        targeting.kind === 'cells'
          ? candidate.cellId
          : targeting.kind === 'options'
            ? candidate.optionId
            : candidate.fighterId,
      );
    // набор собран: окно закрывает общая кнопка, кликать больше нечем
    if (targetingComplete(targeting) && ui.controls?.ok?.enabled !== false) {
      return [{ weight: weights.pick, action: { type: 'UI_OK' } }];
    }
    const options = (targeting.candidates ?? [])
      .filter(candidate => candidate.disabled !== true && !marked.includes(candidateId(candidate)))
      .map(candidate => ({
        weight:
          targeting.kind === 'fighters'
            ? swap
              ? swapWeight(weights, { delta: swapDelta(state, playerId, weights, swap) })
              : fighterPickWeight(weights, candidate.fighterId) *
                sacrificeFactor(state, playerId, targeting, candidate.fighterId, weights)
            : targeting.kind === 'options'
              ? optionPickWeight(weights, candidate)
              : mine
                ? cellPlacementWeight(state, playerId, mine, candidate.cellId, weights)
                : foe
                  ? banishWeight(weights, {
                      value: banishValue(state, playerId, foe, candidate.cellId),
                    })
                  : weights.pick,
        action:
          targeting.kind === 'cells'
            ? { type: 'PICK', kind: 'cell', id: Number(candidate.cellId) }
            : targeting.kind === 'options'
              ? { type: 'PICK', kind: 'option', id: candidate.optionId }
              : { type: 'PICK', kind: 'fighter', id: candidate.fighterId },
      }));
    // отказ — легальный ход необязательного окна (кнопка «Завершить умение» у способности, «Закончить
    // эффект» у карты), а не «осторожный прогон»: без него бот не мог не обменяться и менял Дороти с
    // Тото каждый ход наугад — на этом её винрейт падал до нуля (m02680)
    if (targeting.required !== true) {
      options.push({ weight: weights.pick, action: { type: 'UI_OK' } });
    }
    return options;
  }

  // пауза перемещения от эффекта
  if (state.movement && String(state.movement.playerId) === String(playerId)) {
    // `afterCard` — этот ход уже потратил действие на карту: тогда сближение дешевле (ген `actionSecond`)
    const total = Number(state.turn?.actionsTotal) || 0;
    const left = Number(state.turn?.actionsLeft) || 0;
    return movementActions(state, playerId, state.movement, weightsFor(policy, situation), {
      afterCard: total > 0 && left < total,
    });
  }

  // пауза выбора карты в бою (усиление, сброс): карту тратят, поэтому уходит самая дешёвая
  if (state.combat?.choice) {
    const weights = weightsFor(policy, situation);
    const hand = playerCards(state, playerId);
    /**
     * Своя польза карты в единицах оценки: обещание боя плюс польза эффекта. Она сгорает вместе с картой,
     * поэтому «отмену» и «добор» на усиление шага бот больше не сбрасывает (`cardCostWeight`, ген `stock`).
     * Цели здесь ещё нет — обещание считается без неё, это занижает ценность, но не завышает.
     */
    const ownWorth = card => {
      const promise = cardPromise(card, state, playerId, { context: economy });
      const effect = effectWorth(card, state, playerId, { context: economy });
      return Math.max(0, Number(promise?.worth) || 0) + Math.max(0, Number(effect?.value) || 0);
    };
    const options = (ui.playableCardIds ?? []).map(cardId => {
      const card = hand.find(entry => String(entry.instanceId ?? entry.id) === String(cardId));
      return {
        weight: cardCostWeight(card, weights, {
          fuels: fuelsResource(card, situation.resourceTags),
          own: ownWorth(card),
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
    // кого защищаем: у боя открыт `targetFighterId`. За обычное тело карту защиты не тратят — помощник
    // вернётся картой возврата, а карта уйдёт; исключение — важный помощник (Амат держит пелену, ворона
    // носит «Клёв в темноте»): у него ломается механика пака (решение владельца, m01732)
    const target =
      state.combat?.targetFighterId == null
        ? null
        : fighterWithOwner(state, state.combat.targetFighterId);
    const save = target
      ? {
          type: target.fighter.type,
          hp: Number(target.fighter.currentHp) || 0,
          important:
            String(target.fighter.type) === 'hero' ||
            assistantImportance(target.player.heroId, target.fighter.group) >= BODY_KEY,
        }
      : null;
    // обещание карты считается только политикой, которая его оплачивает (`condition`): у эталонов
    // и у роллаута поиска ген нулевой, поэтому лишних проверок условий там нет
    const promised = weights.condition ? cardPromise : null;
    // своя отмена — не «ещё одна защита»: на удар без свойств её не тратят (`policy.js: defenseWeight`)
    const cancelsOf = cancelCardIds(playerOf(state, playerId)?.heroId);
    const options = (ui.playableCardIds ?? []).map(cardId => {
      const card = cards.find(entry => String(entry.instanceId ?? entry.id) === String(cardId));
      const promise = promised
        ? promised(card, state, playerId, { open: true, context: economy })
        : null;
      return {
        weight: defenseWeight(card, weights, {
          threat,
          strength: promise?.strength,
          save,
          cancels: cancelsOf.has(String(card?.id)),
        }),
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
          weight: fighterPickWeight(weights, fighterId, { attacker: true }),
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

  // Кто ударит и чем рискует: здоровье **своего** атакующего (он известен — движок выбрал его до карты)
  // против ожидания чужой атаки, без подглядывания в чужую руку (`counting.js: expectedAttack`).
  // Раньше здесь стояло здоровье самого слабого **врага** (`reachable.hp`), то есть риск считался не по
  // тому бойцу — сравнение «переживу ли ответ» было бессмысленным.
  const attacker =
    state.combat?.attackerFighterId == null
      ? null
      : fighterWithOwner(state, state.combat.attackerFighterId);
  const attackerHp = attacker == null ? 0 : Number(attacker.fighter.currentHp) || 0;
  // Кто именно бьёт: помощник со слабой картой — приманка, и риск ответа за него считается иначе
  // (`policy.js: baitFactor`, ген `bait`). Важный помощник (Амат, ворона, Тото) приманкой не бывает:
  // на нём держится механика пака.
  const attackerType = attacker == null ? null : (attacker.fighter.type ?? null);
  const attackerImportant =
    attacker == null || String(attackerType) !== 'assistant'
      ? 0
      : assistantImportance(attacker.player.heroId, attacker.fighter.group);
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
  /**
   * Вероятность, что у соперника в руке есть отмена (`.docs/bot-strategies.md` п. 5): обещанная картой
   * польза гасится на неё. Считается только политикой, которая за обещание платит (`cancel` > 0) —
   * роллаут поиска и эталоны живут без этого подсчёта и без его цены.
   */
  const cancelRisk = (Number(weights.cancel) || 0) > 0 ? cancelRiskOf(state, playerId) : 0;

  const options = playable.map(cardId => {
    const card = cards.find(entry => String(entry.instanceId ?? entry.id) === String(cardId));
    if (!isAttackCard(cardId)) {
      // эффектная карта играется за свою пользу **сейчас**: карта, у которой ни одно правило не
      // выполняется, сюда не попадает вовсе (вес 0 — вето, как у «шага в никуда»). Незнакомое
      // содержимое (`known: false`) остаётся нейтральным, чтобы новая механика не выпадала из игры.
      const worth = weights.effect
        ? effectWorth(card, state, playerId, { target: reachable, context: economy })
        : null;
      // карта уйдёт в сброс, а рука доберётся до лимита: при тонкой колоде слабая польза не стоит карты
      // (`bot/play/policy.js: keepPrice`, запрос владельца m02166)
      const keep = keepPrice(weights, { fuel: situation.fuel, rivalFuel: situation.rivalFuel });
      const base =
        worth?.known && worth.fires === 0
          ? 0
          : weights.card + (Number(weights.effect) || 0) * Math.max(0, worth?.value ?? 0);
      // карта с `noReturn` уходит из партии навсегда («Зал суда»): ранняя трата стоит не напечатанной
      // пользы, а всей карты — «Зал суда» бьёт по числу эффектов в сбросе, и в начале партии он пуст
      const permanent =
        (gene('noreturn', Number(weights.noreturn) || 0) > 0 && permanentCard(card) ? 1 : 0) *
        (Number(weights.noreturn) || 0);
      return {
        weight: Math.max(0, base - keep - permanent),
        action: { type: 'PICK', kind: 'card', id: cardId },
      };
    }

    const promise = promised
      ? promised(card, state, playerId, { target: reachable, context: economy })
      : null;
    return {
      weight: attackWeight(card, weights, {
        weakness,
        average,
        strength: promise?.strength,
        promise: promise?.worth,
        deferred: promise?.deferred ?? 0,
        hp: attackerHp,
        threat: counterThreat,
        fuel: situation.fuel,
        rivalFuel: situation.rivalFuel,
        round: situation.round,
        actionsLeft: situation.actionsLeft,
        inFight: situation.inFight,
        enemyHp: weakness,
        enemyType: reachable?.type ?? null,
        enemyImportant: reachable?.important ?? 0,
        material,
        rivalHand,
        stock: situation.defenseStock,
        rivalCards: rivalHand,
        attackerType,
        attackerImportant,
        cancelRisk,
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

/**
 * Своё здоровье на поле в той же шкале, что и чужое: герой весит 1, помощник — 0.5. Раньше здесь
 * суммировалось «сырое» здоровье, и материал был несимметричным: три духа по 1 hp считались у себя
 * тремя единицами, а у врага — полутора, из-за чего перевес по здоровью (`wound`, порог `lead`)
 * читался в свою пользу.
 */
const ownHp = (state, playerId) =>
  fightersOf(state, playerId)
    .filter(fighter => fighter.currentPosition != null)
    .reduce(
      (sum, fighter) =>
        sum + (Number(fighter.currentHp) || 0) * (fighter.type === 'hero' ? 1 : 0.5),
      0,
    );

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

/** Карта, которая в сбросе остаётся навсегда (`noReturn`): «Зал суда» Анубиса и подобные. */
const permanentCard = card =>
  card?.noReturn === true || cardById(card?.id)?.noReturn === true;

/**
 * **Последнего духа не жгут** (`.docs/bot-strategies.md`, Ифрит). Окно умения «Пламя преисподней» платит
 * жизнью духа за действие; пока жив **хоть один** дух, «Пепельная стая» объявляется, а «Плата пеплом» бьёт
 * на 6 — поэтому последний дух стоит дороже лишнего действия. Множитель к весу клика: 1 — обычный выбор,
 * меньше — жертва последнего. Окно узнаётся по правилу, а не по id умения: `picked` с уроном `$picked`.
 */
const LAST_SPIRIT_KEEP = 0.75;

const sacrificeFactor = (state, playerId, targeting, fighterId, weights) => {
  const power = gene('lastspirit', Number(weights?.lastspirit) || 0);
  if (!(power > 0)) return 1;
  const source = sourceDefinition(state, playerId, targeting?.source);
  const pays = (source?.rules ?? []).some(
    rule =>
      String(rule?.moment) === 'picked' &&
      (rule.then ?? []).some(
        step =>
          step.action === 'SET_HEALTH' &&
          Number(step.delta) < 0 &&
          String(step.fighterIds ?? '') === '$picked',
      ),
  );
  if (!pays) return 1;

  const mine = fightersOf(state, playerId);
  const chosen = mine.find(fighter => String(fighter.id) === String(fighterId));
  if (chosen == null || String(chosen.type) === 'hero') return 1;
  const kind = String(chosen.group ?? chosen.id);
  const same = mine.filter(
    fighter =>
      String(fighter.type) !== 'hero' &&
      (Number(fighter.currentHp) || 0) > 0 &&
      String(fighter.group ?? fighter.id) === kind,
  );

  return same.length <= 1 ? Math.max(0.1, 1 - LAST_SPIRIT_KEEP * Math.min(1, power)) : 1;
};
