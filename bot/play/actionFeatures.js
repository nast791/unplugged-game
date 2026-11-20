/**
 * Геометрия поля для решений бота: расстояния по клеткам, расстояния **с занятостью** (сквозь врага не
 * пройти), ценность клетки как перекрытия пути к своему герою (`guardValue`) и подставы под удар
 * (`exposureValue`). Считается это на перечислении вариантов (`bot/play/decide.js`) и в оценке листа
 * (`bot/play/search.js`), поэтому BFS и кэши живут здесь: обход 112 клеток на каждый вариант и каждое
 * доигрывание стоил бы дороже самой игры.
 *
 * Вектор признаков варианта хода (`ACTION_FEATURES` = 23 числа) удалён вместе с учеником
 * (`qvalue`/`qprior`, §64) — ни политика, ни поиск его не читали, он оставался входом снятой модели.
 */
export const playerOf = (state, playerId) =>
  (state.players ?? []).find(player => String(player.id) === String(playerId)) ?? null;

/**
 * Индекс «id клетки → клетка» по массиву карты: один раз на партию, а не на каждый обход (§48).
 * Ключ — сам массив `state.map.nodes`, который форк состояния переиспользует, поэтому `WeakMap` не копит
 * карты разных партий.
 */
const nodeIndexCache = new WeakMap();

const nodeIndex = nodes => {
  if (!Array.isArray(nodes)) return new Map();
  const hit = nodeIndexCache.get(nodes);
  if (hit != null) return hit;
  const index = new Map(nodes.map(node => [String(node.id), node]));
  nodeIndexCache.set(nodes, index);
  return index;
};

/** Дистанция по полю (предел 6): короткий BFS по индексу клеток, без полной карты расстояний. */
export const distanceBetween = (state, from, to) => {
  if (from == null || to == null) return 6;
  const start = String(from);
  const goal = String(to);
  if (start === goal) return 0;

  const nodes = nodeIndex(state.map?.nodes);
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

/**
 * Дистанции от клетки до всех остальных **одним обходом** (предел 6). У перемещения вариантов десятки,
 * а поиск зовёт это на каждом доигрывании: отдельный BFS на каждого врага и каждого своего бойца
 * стоил бы дороже самого перечисления. Экспортируется ещё и оценке листа (`bot/play/search.js`), которая
 * считает угрозу герою и прикрытие, — там те же расстояния.
 *
 * Карта расстояний **кэшируется по объекту карты и клетке отправления** (§48): поле в партии не меняется,
 * поэтому обход делается один раз на клетку, а не на каждый вариант и каждое доигрывание. Ключ — сам
 * массив `state.map.nodes`: форк состояния переиспользует его, а новая партия даёт новый объект, поэтому
 * `WeakMap` не течёт между партиями.
 */
const cellDistanceCache = new WeakMap();

export const cellDistances = (state, from) => {
  const nodes = state.map?.nodes;
  if (!Array.isArray(nodes) || from == null) return new Map();

  let perMap = cellDistanceCache.get(nodes);
  if (perMap == null) {
    // индекс «id → клетка»: линейный поиск по 112 клеткам на каждом шаге обхода стоил больше самого BFS
    perMap = { index: nodeIndex(nodes), distances: new Map() };
    cellDistanceCache.set(nodes, perMap);
  }
  const key = String(from);
  const hit = perMap.distances.get(key);
  if (hit != null) return hit;

  const seen = new Map([[key, 0]]);
  const queue = [[key, 0]];
  while (queue.length > 0) {
    const [cell, step] = queue.shift();
    if (step >= 6) continue;
    for (const neighbour of perMap.index.get(cell)?.neighbors ?? []) {
      const next = String(neighbour);
      if (seen.has(next)) continue;
      seen.set(next, step + 1);
      queue.push([next, step + 1]);
    }
  }

  perMap.distances.set(key, seen);
  return seen;
};

/** Занятые клетки: клетка → хозяин. Тело в проходе закрывает дорогу, поэтому позиции нужен не только граф. */
export const fighterCells = (state, { skip = null } = {}) => {
  const index = new Map();
  for (const player of state.players ?? []) {
    for (const fighter of player.fighters ?? []) {
      if (fighter.currentPosition == null) continue;
      if (skip != null && String(fighter.id) === String(skip)) continue;
      const cell = String(fighter.currentPosition);
      if (index.has(cell)) continue;
      index.set(cell, {
        playerId: String(player.id),
        type: fighter.type,
        group: fighter.group ?? null,
        hp: Number(fighter.currentHp) || 0,
      });
    }
  }
  return index;
};

/**
 * Дистанции от клетки **с занятостью**: сквозь бойцов другой стороны прохода нет (правило движка «сквозь
 * врагов нельзя»), свои проходимы. `extra` — гипотетический боец, которого на поле ещё нет: так меряется
 * «станет ли врагу дальше, если мой боец встанет здесь». Предел 8: важна не длина, а «стало ли дальше».
 *
 * Кэш по **объекту состояния**: занятость в партии меняется каждым действием, поэтому ключ — состояние, а
 * не карта; зато внутри одного решения (перебор окон, доигрывания планировщика) один и тот же обход идёт
 * один раз. Форк даёт новое состояние — кэш умирает вместе с ним.
 */
const blockedCache = new WeakMap();

export const blockedDistances = (
  state,
  from,
  { viewerId = null, extra = null, goal = null, skip = null } = {},
) => {
  const cacheKey = [
    String(from),
    viewerId ?? '-',
    goal ?? '-',
    skip ?? '-',
    extra?.cellId == null ? '-' : `${extra.cellId}:${extra.playerId ?? '-'}`,
  ].join('|');
  let perState = blockedCache.get(state);
  if (perState == null) {
    perState = new Map();
    blockedCache.set(state, perState);
  }
  const cached = perState.get(cacheKey);
  if (cached != null) return cached;

  const nodes = nodeIndex(state.map?.nodes);
  const occupied = fighterCells(state, { skip });
  const start = String(from);
  const goalCell = goal == null ? null : String(goal);
  if (extra?.cellId != null) {
    occupied.set(String(extra.cellId), {
      playerId: extra.playerId == null ? null : String(extra.playerId),
      type: extra.type ?? 'assistant',
      group: extra.group ?? null,
      hp: 0,
    });
  }
  // цель перекрытия меряем до самой цели: свой герой на своей клетке не «стена» для замера, иначе
  // расстояние до него всегда неизвестно и ценность перекрытия выходила бы нулевой
  const blocked = cell => {
    const key = String(cell);
    if (goalCell != null && key === goalCell) return false;
    const owner = occupied.get(key);
    return owner != null && viewerId != null && String(owner.playerId) !== String(viewerId);
  };

  const seen = new Map([[start, 0]]);
  const queue = [[start, 0]];
  while (queue.length > 0) {
    const [cell, step] = queue.shift();
    if (step >= 8) continue;
    for (const neighbour of nodes.get(cell)?.neighbors ?? []) {
      const next = String(neighbour);
      if (seen.has(next) || blocked(next)) continue;
      seen.set(next, step + 1);
      queue.push([next, step + 1]);
    }
  }

  perState.set(cacheKey, seen);

  return seen;
};

/**
 * Ценность клетки как **перекрытия пути** к моему герою: насколько дальше станет ближайшему чужому герою,
 * если мой боец встанет сюда. Тело с 2 hp в коридоре стоит дороже, чем то же тело в чистом поле, —
 * ровно этого не видел граф без занятости. Ноль — клетка путей не перекрывает.
 */
/** Кэш ценности перекрытия: на одно состояние — одна таблица «клетка → ценность» на игрока. */
const guardCache = new WeakMap();

export const guardValue = (state, playerId, cellId, { skip = null } = {}) => {
  if (cellId == null) return 0;
  let perState = guardCache.get(state);
  if (perState == null) {
    perState = new Map();
    guardCache.set(state, perState);
  }
  const cacheKey = `${playerId}|${skip ?? '-'}`;
  let cells = perState.get(cacheKey);
  if (cells == null) {
    cells = new Map();
    perState.set(cacheKey, cells);
  }
  const key = String(cellId);
  const cached = cells.get(key);
  if (cached != null) return cached;

  const value = guardValueOf(state, playerId, cellId, skip);
  cells.set(key, value);

  return value;
};

const guardValueOf = (state, playerId, cellId, skip) => {
  const mine = playerOf(state, playerId);
  const others = (state.players ?? []).filter(player => String(player.id) !== String(playerId));
  const myHero = (mine?.fighters ?? []).find(fighter => fighter.type === 'hero');
  if (myHero?.currentPosition == null) return 0;
  const heroCell = String(myHero.currentPosition);
  const foe = others
    .flatMap(player =>
      (player.fighters ?? [])
        .filter(fighter => fighter.type === 'hero' && fighter.currentPosition != null)
        .map(fighter => ({ player, fighter })),
    )
    .sort(
      (a, b) =>
        distanceBetween(state, a.fighter.currentPosition, heroCell) -
        distanceBetween(state, b.fighter.currentPosition, heroCell),
    )[0];
  if (foe == null) return 0;
  const fromCell = String(foe.fighter.currentPosition);
  if (String(cellId) === fromCell) return 0;
  const before =
    blockedDistances(state, fromCell, { viewerId: foe.player.id, goal: heroCell, skip }).get(
      heroCell,
    ) ?? 8;
  const after =
    blockedDistances(state, fromCell, {
      viewerId: foe.player.id,
      goal: heroCell,
      skip,
      extra: { cellId, playerId },
    }).get(heroCell) ?? 8;

  return Math.max(0, Math.min(3, after - before)) / 3;
};

/**
 * Насколько клетка подставляется под чужой удар: сколько чужих бойцов достают её своей дальностью.
 * Бойцу с малым здоровьем стоять под тремя стволами незачем — это подарок, а не блокер.
 */
export const exposureValue = (state, playerId, cellId) => {
  if (cellId == null) return 0;
  const distances = cellDistances(state, cellId);
  let threats = 0;
  for (const player of state.players ?? []) {
    if (String(player.id) === String(playerId)) continue;
    for (const fighter of player.fighters ?? []) {
      if (fighter.currentPosition == null) continue;
      const range = Number(fighter.attackRange) || 1;
      const distance = distances.get(String(fighter.currentPosition));
      if (distance != null && distance > 0 && distance <= range) threats += 1;
    }
  }

  return Math.min(1, threats / 3);
};

/**
 * Ближайший **чужой герой** к моему: вокруг него считаются теснота (п. 8) и перекрытие пути к моим
 * дешёвым бойцам (п. 2 «б»). Чужой герой — единственная цель, за которой стоит победа, поэтому теснота
 * вокруг помощника смысла не имеет.
 */
export const nearestFoeHero = (state, playerId) => {
  const mine = playerOf(state, playerId);
  const myHero = (mine?.fighters ?? []).find(
    fighter => fighter.type === 'hero' && fighter.currentPosition != null,
  );
  const heroes = (state.players ?? [])
    .filter(player => String(player.id) !== String(playerId))
    .flatMap(player =>
      (player.fighters ?? [])
        .filter(fighter => fighter.type === 'hero' && (Number(fighter.currentHp) || 0) > 0)
        .map(fighter => ({ player, fighter })),
    )
    .filter(entry => entry.fighter.currentPosition != null);
  if (heroes.length === 0) return null;
  if (myHero?.currentPosition == null) return heroes[0];

  const distances = cellDistances(state, myHero.currentPosition);
  return heroes.reduce((best, entry) =>
    (distances.get(String(entry.fighter.currentPosition)) ?? 6) <
    (distances.get(String(best.fighter.currentPosition)) ?? 6)
      ? entry
      : best,
  );
};

/**
 * **Теснота вокруг чужого героя** (`.docs/bot-strategies.md` п. 8): число его свободных соседних клеток.
 * Симметрично признаку `room` листа («свободные клетки рядом с моим героем»), только с той стороны: сквозь
 * чужих бойцов пройти нельзя, поэтому каждое занятое тело рядом с героем — это минус выход.
 *
 * `cellId` — гипотетическое тело (шаг, которым бот закрывает выход), `skip` — боец, которого на клетке
 * уже нет: без них «станет ли теснее» не посчитать. Отдаётся **число** клеток: шаг ценится разницей,
 * а лист нормирует сам (`bot/play/value.js`).
 */
export const foeRoomValue = (state, playerId, cellId = null, { skip = null } = {}) => {
  const foe = nearestFoeHero(state, playerId);
  if (foe?.fighter?.currentPosition == null) return 0;
  const nodes = nodeIndex(state.map?.nodes);
  const node = nodes.get(String(foe.fighter.currentPosition));
  const occupied = fighterCells(state, { skip });
  if (cellId != null) occupied.set(String(cellId), { playerId: String(playerId), type: 'assistant' });

  return (node?.neighbors ?? []).filter(cell => !occupied.has(String(cell))).length;
};

/**
 * **Перекрытие кратчайшего пути чужого героя к моему дешёвому бойцу** (`.docs/bot-strategies.md` п. 2 «б»).
 * Сквозь врагов не пройти, поэтому тело, вставшее на кратчайший маршрут, заставляет героя идти кругом.
 *
 * Считается по **двум** кэшам расстояний (`cellDistances`): маршрут проходит через клетку, если
 * `d(герой→клетка) + d(клетка→боец) = d(герой→боец)`. Обход с занятостью здесь не нужен: маршрут
 * проверяется до шага, а сам шаг и есть препятствие. Цена — две карты расстояний, уже посчитанные для
 * других вариантов, поэтому признак дешёвый (в отличие от `blockedDistances`, которые стоят BFS).
 */
export const routeBlockValue = (state, playerId, cellId) => {
  const foe = nearestFoeHero(state, playerId);
  const mine = playerOf(state, playerId);
  const cheap = (mine?.fighters ?? [])
    .filter(
      fighter =>
        fighter.type !== 'hero' &&
        (Number(fighter.currentHp) || 0) > 0 &&
        fighter.currentPosition != null,
    )
    .sort((left, right) => (Number(left.currentHp) || 0) - (Number(right.currentHp) || 0))[0];
  if (foe?.fighter?.currentPosition == null || cheap?.currentPosition == null) return 0;

  const from = String(foe.fighter.currentPosition);
  const goal = String(cheap.currentPosition);
  const head = cellDistances(state, from);
  const total = head.get(goal);
  // дальше шести шагов не различаем: там «путь» — это уже вся карта, и перекрывать нечего
  if (total == null || total < 1 || total >= 6) return 0;
  const step = head.get(String(cellId));
  const tail = cellDistances(state, goal).get(String(cellId));
  if (step == null || tail == null || step + tail !== total) return 0;
  // короткий маршрут перекрыть ценнее: там тело действительно единственный выход
  return total <= 4 ? 1 : 0.6;
};

/**
 * Насколько клетка **дальше** от врагов, чем текущая: шаг в тыл приговорённому важному помощнику (Амат,
 * ворона). Считается по тому же кэшу расстояний, что и всё остальное, и отдаёт долю 0…1 за два шага
 * отрыва: дальше уже не различаем.
 */
export const rearValue = (state, playerId, from, cellId) => {
  if (cellId == null) return 0;
  const danger = cell => {
    const distances = cellDistances(state, cell);
    let best = 6;
    for (const player of state.players ?? []) {
      if (String(player.id) === String(playerId)) continue;
      for (const fighter of player.fighters ?? []) {
        if (fighter.currentPosition == null || (Number(fighter.currentHp) || 0) <= 0) continue;
        best = Math.min(best, distances.get(String(fighter.currentPosition)) ?? 6);
      }
    }
    return best;
  };

  return Math.max(0, Math.min(1, (danger(cellId) - danger(from)) / 2));
};
