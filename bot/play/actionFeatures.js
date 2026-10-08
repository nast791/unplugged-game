import { cardFighterId, cardTags, fighterMatchesBinding } from '#shared/helpers/cards.js';
import { cardPromise } from './cards.js';
import { cardIdOf } from './metrics.js';
import { cardById, resourceTags, terrainAffinity } from './pool.js';

/**
 * Признаки варианта хода: то, чем одно действие отличается от другого **числами**, понятными любому
 * тренеру. Модуль общий для обучения и игры: `bot/learn/export.js` кладёт эти числа в JSONL, а
 * `bot/play/qvalue.js` считает по ним оценку действия в партии — поэтому расхождения между тем, на чём
 * учились и на чём играют, быть не может.
 *
 * Порядок фиксирован (23 числа):
 *   0..4   вид действия: карта, колода, боец, клетка, «закончить»
 *   5..6   сила карты / 10 и усиление / 4
 *   7..9   тип карты: атака или гибрид, защита или гибрид, эффект
 *   10..11 обещание карты: эффективное число / 10 и прочая польза / 2 (`cardPromise`)
 *   12..13 привязка карты: свой герой, свой помощник
 *   14..16 цель-боец: здоровье / 16, это герой, дистанция до ближайшего врага / 6
 *   17     клетка шага на своей стихии
 *   18     карта несёт метку ресурса героя (топливо)
 *   19     вес политики для этого варианта, нормированный на сильнейший в этом решении
 *   20..22 клетка: дистанция до ближайшего врага / 6, враг достаёт её своей дальностью, дистанция до
 *          ближайшего своего бойца / 6
 *
 * Последний признак добавлен после первого замера (§22): без него студент не видит того, на что
 * опирается учитель, и обученная политика проигрывает той, с которой училась. Это «мнение политики» —
 * вход, а не цель: модель учится его поправлять, а не повторять.
 *
 * Блок 20..22 добавлен после аудита §28: у вариантов-клеток внутри одного решения совпадали **все**
 * признаки (стихия и вес политики у них одинаковы), поэтому 86,7% таких решений получали одну и ту же
 * оценку — «шаг к врагу» и «шаг в пустоту» были для модели неразличимы, и ходы помощников (у Медузы три
 * гарпии) выбирались произвольно. Старые артефакты (`actionDim: 20`) эти числа просто не читают —
 * чтобы они заработали, дневник пересобирается, а модель переучивается.
 */
export const ACTION_FEATURES = 23;

/**
 * Признаки позиции, которые модель скрещивает с признаками действия: без скрещивания оценка пары
 * свелась бы к «мне нравится эта карта вообще», а не «мне нравится она **здесь**». Список уезжает в
 * артефакт, поэтому тренер и игра берут порядок из одного места.
 */
export const SUMMARY_FEATURES = [
  'heroHp',
  'teamHp',
  'fighters',
  'hand',
  'deck',
  'resourceOn',
  'stillness',
  'sidekickHp',
];

export const playerOf = (state, playerId) =>
  (state.players ?? []).find(player => String(player.id) === String(playerId)) ?? null;

export const heroOf = (state, playerId) => String(playerOf(state, playerId)?.heroId ?? playerId);

export const rivalOf = (state, playerId) =>
  String(
    (state.players ?? [])
      .filter(player => String(player.id) !== String(playerId))
      .map(player => String(player.heroId ?? player.id))[0] ?? '',
  );

/** Дистанция по полю: для экспорта и живой игры этого хватает, кэш не нужен (не горячий путь). */
export const distanceBetween = (state, from, to) => {
  if (from == null || to == null) return 6;
  const start = String(from);
  const goal = String(to);
  if (start === goal) return 0;

  const nodes = new Map((state.map?.nodes ?? []).map(node => [String(node.id), node]));
  const seen = new Set([start]);
  const queue = [[start, 0]];
  while (queue.length > 0) {
    const [cell, step] = queue.shift();
    for (const neighbour of nodes.get(cell)?.neighbors ?? []) {
      const key = String(neighbour);
      if (seen.has(key)) continue;
      if (key === goal) return step + 1;
      seen.add(key);
      if (step < 6) queue.push([key, step + 1]);
    }
  }

  return 6;
};

export const nearestEnemyDistance = (state, playerId, fighterId) => {
  const mine = (playerOf(state, playerId)?.fighters ?? []).find(
    fighter => String(fighter.id) === String(fighterId),
  );
  if (mine?.currentPosition == null) return 6;

  const others = (state.players ?? [])
    .filter(player => String(player.id) !== String(playerId))
    .flatMap(player => player.fighters ?? [])
    .filter(fighter => fighter.currentPosition != null && Number(fighter.currentHp) > 0);

  return others.reduce(
    (best, enemy) =>
      Math.min(best, distanceBetween(state, mine.currentPosition, enemy.currentPosition)),
    6,
  );
};

const round = value => Math.round((Number(value) || 0) * 10000) / 10000;

/**
 * Дистанции от клетки до всех остальных **одним обходом** (предел 6). У перемещения вариантов десятки,
 * а поиск зовёт это на каждом доигрывании: отдельный BFS на каждого врага и каждого своего бойца
 * стоил бы дороже самого перечисления. Экспортируется ещё и оценке листа (`bot/play/search.js`), которая
 * считает угрозу герою и прикрытие, — там те же расстояния.
 */
export const cellDistances = (state, from) => {
  const nodes = new Map((state.map?.nodes ?? []).map(node => [String(node.id), node]));
  const start = String(from);
  const seen = new Map([[start, 0]]);
  const queue = [[start, 0]];
  while (queue.length > 0) {
    const [cell, step] = queue.shift();
    if (step >= 6) continue;
    for (const neighbour of nodes.get(cell)?.neighbors ?? []) {
      const key = String(neighbour);
      if (seen.has(key)) continue;
      seen.set(key, step + 1);
      queue.push([key, step + 1]);
    }
  }
  return seen;
};

/** Признаки одного варианта хода (`option` — вариант из `actionsFor`). */
export const actionFeatures = (state, playerId, option, { priorScale = 1 } = {}) => {
  const action = option?.action ?? option ?? {};
  const vector = new Array(ACTION_FEATURES).fill(0);
  const kind = String(action.kind ?? (action.type === 'UI_OK' ? 'ok' : ''));
  const heroId = heroOf(state, playerId);
  const player = playerOf(state, playerId);
  const affinity = new Set(terrainAffinity(heroId));

  // «мнение политики»: насколько этот вариант весом для неё относительно сильнейшего в решении
  vector[19] = Math.max(0, Number(option?.weight) || 0) / Math.max(1, Number(priorScale) || 1);

  if (kind === 'card') vector[0] = 1;
  if (kind === 'deck') vector[1] = 1;
  if (kind === 'fighter') vector[2] = 1;
  if (kind === 'cell') vector[3] = 1;
  if (action.type === 'UI_OK') vector[4] = 1;

  if (kind === 'card') {
    const instance = String(action.id);
    const card =
      (player?.hand?.cards ?? []).find(
        entry => String(entry.instanceId ?? entry.id) === instance,
      ) ?? cardById(cardIdOf(instance));
    if (card != null) {
      vector[5] = Math.max(0, Number(card.value) || 0) / 10;
      vector[6] = Math.max(0, Number(card.bonus) || 0) / 4;
      if (card.type === 'attack' || card.type === 'hybrid') vector[7] = 1;
      if (card.type === 'defense' || card.type === 'hybrid') vector[8] = 1;
      if (card.type === 'effect') vector[9] = 1;

      // цель боя до объявления карты неизвестна: обещание считается без неё, поэтому условия,
      // которым нужна цель, не подтверждаются — честно, а не оптимистично
      const promise = cardPromise(card, state, playerId, { open: state.combat != null });
      vector[10] = promise.strength / 10;
      vector[11] = promise.worth / 2;

      const bound = cardFighterId(card);
      const matching = (player?.fighters ?? []).filter(fighter =>
        fighterMatchesBinding(fighter, bound),
      );
      if (matching.some(fighter => fighter.type === 'hero')) vector[12] = 1;
      if (matching.some(fighter => fighter.type === 'assistant')) vector[13] = 1;

      const tags = resourceTags(heroId);
      if (tags.size > 0 && [...cardTags(card)].some(tag => tags.has(tag))) vector[18] = 1;
    }
  }

  if (kind === 'fighter') {
    const fighter = (state.players ?? [])
      .flatMap(entry => entry.fighters ?? [])
      .find(entry => String(entry.id) === String(action.id));
    if (fighter != null) {
      vector[14] = Math.max(0, Number(fighter.currentHp) || 0) / 16;
      if (fighter.type === 'hero') vector[15] = 1;
      vector[16] = nearestEnemyDistance(state, playerId, fighter.id) / 6;
    }
  }

  if (kind === 'cell') {
    const node = (state.map?.nodes ?? []).find(cell => String(cell.id) === String(action.id));
    const terrains = Array.isArray(node?.terrain)
      ? node.terrain.map(String)
      : [String(node?.terrain)];
    if (terrains.some(terrain => affinity.has(terrain))) vector[17] = 1;

    // Позиция клетки: куда ведёт шаг. Дистанции берутся одним обходом, «нет никого» — это 6 (далеко),
    // а не 0 (вплотную): во время расстановки позиций нет ни у кого, и ноль читался бы наоборот.
    const distances = cellDistances(state, action.id);
    const distanceTo = cell => (cell == null ? 6 : (distances.get(String(cell)) ?? 6));
    const enemies = (state.players ?? [])
      .filter(player => String(player.id) !== String(playerId))
      .flatMap(player => player.fighters ?? [])
      .filter(fighter => fighter.currentPosition != null && Number(fighter.currentHp) > 0);
    const allies = (player?.fighters ?? []).filter(
      fighter => fighter.currentPosition != null && Number(fighter.currentHp) > 0,
    );

    vector[20] =
      (enemies.length === 0
        ? 6
        : Math.min(...enemies.map(enemy => distanceTo(enemy.currentPosition)))) / 6;
    vector[21] = enemies.some(
      enemy => distanceTo(enemy.currentPosition) <= (Number(enemy.attackRange) || 1),
    )
      ? 1
      : 0;
    vector[22] =
      (allies.length === 0
        ? 6
        : Math.min(...allies.map(ally => distanceTo(ally.currentPosition)))) / 6;
  }

  return vector.map(round);
};

export default actionFeatures;
