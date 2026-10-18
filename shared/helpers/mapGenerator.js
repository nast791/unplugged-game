import { TERRAIN_IDS, isTerrainId } from '#shared/constants/terrain.js';
import { seatSide } from '#shared/constants/seats.js';

/**
 * Генератор полей: раскладка клеток + земли + стартовые клетки, всё от сида партии.
 *
 * Правила земель (решение владельца, m00001): на поле 8–10 разных земель по сиду, каждая — своя зона
 * без повторов. Стартовых земель ровно по числу игроков: на них стоят номерные клетки и хватает места
 * на весь пак стороны. Остальные земли — малые: без номеров, у краёв, размером от одной клетки до
 * размера самой крупной крупной земли. Земли героев (`terrainAffinity`) входят в набор, но старт к ним
 * не привязан: карта обязана их содержать, а не ставить героя на «его» стихию.
 * Одна земля не занимает больше `MAX_TERRAIN_CELLS` клеток поля.
 *
 * Честность старта (правило владельца, m00532): клетка, соседняя с номерной, не может принадлежать
 * чужой стартовой области — иначе помощник встаёт вплотную к чужому герою. Между номерами остаётся
 * малая земля или своя крупная, и такие старты генератор только и принимает.
 *
 * Ориентиры — настоящие поля Unmatched (`.refs/maps`): всего 28–38 клеток. Оттуда же анатомия
 * раскладки: кружки стоят не по сетке, связи разные (у клетки 2–5 соседей), зоны выходят неровными.
 * Клеток с двумя и тремя стихиями немного, но хотя бы одна двухцветная и одна трёхцветная обязательны.
 * Генератор чистый: тот же сид и те же параметры — та же карта.
 */
export const BOARD_PRESETS = {
  2: { cells: [32, 36] },
  3: { cells: [34, 40] },
  4: { cells: [34, 42] },
};

/** Сколько разных земель бывает на поле: минимум 8, максимум 10 — по сиду. */
export const MIN_TERRAIN_COUNT = 8;
export const MAX_TERRAIN_COUNT = 10;
/** Предел клеток на один тип земли: больше десяти клеток земля не занимает (правило владельца). */
export const MAX_TERRAIN_CELLS = 10;
/**
 * Минимум шагов между номерными клетками (правило владельца). Считаем **шаги по связям**, а не
 * пиксели: дальность атаки и шага в правилах — это BFS по соседям, поэтому «четыре клетки» значит
 * ровно четыре перехода. Наибольшая дальность атаки в игре — 3, значит на четырёх шагах никто не
 * достаёт чужой номерной клетки с места, и партия не начинается с драки.
 */
export const START_GAP_STEPS = 4;
/**
 * Границы **ручного** размера поля (клетки): «Авто» отдаёт размер сиду по пресетам выше, а игрок может
 * задать число сам. Меньше 32 — тесно стартовым землям и 4–6 малым, больше 42 — полотно вместо поля.
 */
export const CELLS_LIMIT = { min: 32, max: 42 };
/** Сколько цветных клеток бывает на поле: трёхцветных 1–4, двухцветных 2–8. */
export const MULTI_CELL_COUNTS = { three: [1, 4], two: [2, 8] };
/**
 * Шаг сетки. Кружки не должны стоять вплотную: между ними обязана быть видна линия-соединитель,
 * поэтому шаг заметно больше размера клетки (зазор около 40% диаметра). По горизонтали шаг чуть
 * больше, чем по вертикали — поле вытянуто под прямоугольный экран.
 */
export const CELL_STEP = 170;
export const CELL_STEP_Y = 158;
/** Разброс координат по умолчанию — в процентах шага (используется в тестах). */
export const CELL_JITTER = 8;
/** Размер клетки для клиента: кружок с воздухом вокруг, соединители читаются. */
export const CELL_SIZE = 112;
/** Предел связей у клетки после прямых линий между клетками одной земли (раскладка даёт до шести). */
export const MAX_CELL_LINKS = 8;
/** Сколько раз пробуем другой расклад, если не сошлись гарантии. */
const ATTEMPTS = 500;

/** Вероятности связей: сетка не полная, поэтому у клеток разное число соседей. */
const LINK_CHANCE = { ortho: 0.8, diagonal: 0.3 };
/** Линия не должна проходить сквозь третий кружок: проверяем расстояние центра до отрезка. */
const LINK_CLEARANCE = 64;

const nextValue = value => (Math.imul(value, 1103515245) + 12345) >>> 0;

const makeRng = seed => {
  let value = nextValue(Number(seed) || 1);
  const next = () => {
    value = nextValue(value);
    return value;
  };
  return {
    next,
    int: max => next() % max,
    chance: probability => next() % 1000 < probability * 1000,
    pick: list => list[next() % list.length],
    shuffle: list => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = next() % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
};

const distanceBetween = (left, right) =>
  Math.abs(left.col - right.col) + Math.abs(left.row - right.row);

/**
 * Расстояние в шагах по связям поля: столько шагов боец пройдёт от клетки до клетки. Именно этой
 * мерой считают дальность правила (`shared/helpers/board.js`), поэтому и стартовые клетки разводим
 * ею, а не пикселями: на глаз две клетки могут стоять далеко, а по полю быть в одном шаге.
 */
export const stepsBetween = (nodes, from, to) => {
  const byId = new Map((nodes ?? []).map(node => [String(node.id), node]));
  const start = String(from);
  const finish = String(to);
  if (!byId.has(start) || !byId.has(finish)) return null;
  if (start === finish) return 0;

  const seen = new Set([start]);
  let frontier = [start];
  for (let step = 1; frontier.length; step += 1) {
    const next = [];
    for (const id of frontier) {
      for (const raw of byId.get(id)?.neighbors ?? []) {
        const neighbour = String(raw);
        if (seen.has(neighbour)) continue;
        if (neighbour === finish) return step;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return null;
};

/** Случайное целое из диапазона [min, max] по генератору карты. */
const pickRange = (rng, [min, max]) => min + rng.int(max - min + 1);

/**
 * Целевое соотношение сторон поля в пикселях. Доска вписывается в контейнер целиком, а он шире
 * классических 16:9 (сбоку панель), поэтому поле делаем вытянутым: **меньше рядов, больше колонок** —
 * тогда масштаб ограничивает не ширина, и кружки выходят крупнее. Точное значение выбирается по сиду.
 */
const SHAPE_RATIO = 2.3;
const SHAPE_RATIO_RANGE = [2.1, 2.7];

/**
 * Черновик раскладки: форма **выращивается** от центра неровным пятном, а не вырезается из
 * прямоугольника. Из-за этого где-то торчит одна клетка сбоку, где-то две: силуэт асимметричный,
 * как на нарисованных полях. Рост смещён вширь, чтобы поле оставалось вытянутым.
 */
const draftCells = (target, rng, options = {}) => {
  const shapeRatio = options.shapeRatio ?? SHAPE_RATIO;
  const momentum = options.momentum ?? 0.55;
  let best = null;
  for (let width = 6; width <= 16; width += 1) {
    const height = Math.max(3, Math.round((width * CELL_STEP) / (shapeRatio * CELL_STEP_Y)));
    const capacity = width * height;
    // рамка с запасом: пятно заполняет её не целиком, поэтому края получаются рваными
    const slack = capacity - target;
    if (slack < 6 || height < 3) continue;
    const pixelRatio = ((width - 1) * CELL_STEP) / ((height - 1) * CELL_STEP_Y);
    // рамка должна быть вытянутой и как можно плотнее к нужному числу клеток
    const score = Math.abs(pixelRatio - shapeRatio) * 2 + slack * 0.08;
    if (!best || score < best.score) best = { width, height, score };
  }
  if (!best) throw new Error(`генератор: не удалось подобрать рамку на ${target} клеток`);

  const { width, height } = best;
  const key = (col, row) => `${col}:${row}`;
  const present = new Set();
  const centre = { col: Math.floor(width / 2), row: Math.floor(height / 2) };
  const cells = [centre];
  present.add(key(centre.col, centre.row));

  // рост с «инерцией»: чаще продолжаем от последней клетки, иногда прыгаем в любую другую.
  // Так появляются выступы — где-то одна клетка торчит сбоку, где-то две.
  let cursor = centre;
  const inBox = (col, row) => col >= 0 && row >= 0 && col < width && row < height;
  while (cells.length < target) {
    const from = rng.chance(momentum) ? cursor : rng.pick(cells);
    const options = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
      .map(([dx, dy]) => ({ col: from.col + dx, row: from.row + dy }))
      .filter(cell => inBox(cell.col, cell.row) && !present.has(key(cell.col, cell.row)));
    if (options.length === 0) {
      cursor = rng.pick(cells);
      continue;
    }

    // вширь растём охотнее, чем вверх: поле вытянутое
    const weighted = options.flatMap(cell => {
      const horizontal = cell.row === from.row;
      return Array.from({ length: horizontal ? 3 : 1 }, () => cell);
    });
    const pick = rng.pick(weighted);
    present.add(key(pick.col, pick.row));
    cells.push(pick);
    cursor = pick;
  }

  return { cells, width, height };
};

/** Глубина клетки: 0 — на самом краю поля, 1 — соседняя с краем, дальше — внутри. */
const cellDepth = (cells, cell, width, height) => {
  const present = new Set(cells.map(entry => `${entry.col}:${entry.row}`));
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let depth = Infinity;
  for (const [dx, dy] of directions) {
    let step = 1;
    for (;;) {
      const col = cell.col + dx * step;
      const row = cell.row + dy * step;
      if (col < 0 || row < 0 || col >= width || row >= height) break;
      if (!present.has(`${col}:${row}`)) break;
      step += 1;
    }
    depth = Math.min(depth, step - 1);
  }
  return depth;
};

/**
 * Сколько шагов от клетки до **края поля** в её сторону: 0 — клетка в самой крайней колонке (строке)
 * поля, 1 — в следующей от края. Считаем от габарита всего поля, а не «до первой дырки в ряду»:
 * у неровной формы клетка может быть последней в своём ряду и при этом стоять третьей от края поля,
 * а игрок считает край именно по полю.
 */
const sideEdgeSteps = (cells, cell, side) => {
  const cols = cells.map(entry => entry.col);
  const rows = cells.map(entry => entry.row);
  if (side === 'left') return cell.col - Math.min(...cols);
  if (side === 'right') return Math.max(...cols) - cell.col;
  if (side === 'top') return cell.row - Math.min(...rows);
  return Math.max(...rows) - cell.row;
};

const isConnected = cells => {
  if (cells.length === 0) return true;
  const seen = new Set([cells[0].id]);
  const queue = [cells[0]];
  const byId = new Map(cells.map(cell => [cell.id, cell]));
  while (queue.length) {
    const cell = queue.shift();
    for (const neighbourId of cell.neighbors) {
      if (seen.has(neighbourId)) continue;
      const neighbour = byId.get(neighbourId);
      if (!neighbour) continue;
      seen.add(neighbourId);
      queue.push(neighbour);
    }
  }
  return seen.size === cells.length;
};

const link = (left, right) => {
  if (!left.neighbors.includes(right.id)) left.neighbors.push(right.id);
  if (!right.neighbors.includes(left.id)) right.neighbors.push(left.id);
};

/** Соседи в раскладке: рядом по горизонтали/вертикали или по диагонали. */
const isNeighbourPair = (left, right) => {
  const colGap = Math.abs(left.col - right.col);
  const rowGap = Math.abs(left.row - right.row);
  return colGap + rowGap === 1 || (colGap === 1 && rowGap === 1);
};

/** Расстояние от точки до отрезка: линия не должна проходить сквозь третий кружок. */
const distanceToSegment = (point, left, right) => {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - left.x) * dx + (point.y - left.y) * dy) / lengthSquared),
  );
  const px = left.x + t * dx;
  const py = left.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
};

/** Свободен ли отрезок между двумя клетками: третий кружок не должен стоять на линии. */
const clearsSegment = (left, right, cells) =>
  cells.every(
    other =>
      other === left || other === right || distanceToSegment(other, left, right) >= LINK_CLEARANCE,
  );

/**
 * Связи: только между соседними кружками — ортогональные и часть диагоналей. Длинных линий нет,
 * и линия не проходит сквозь третий кружок (иначе кажется, что она соединяет не соседей).
 * Затем добираем клетки с одним соседом и склеиваем компоненты графа.
 */
const buildLinks = (cells, rng) => {
  for (const cell of cells) cell.neighbors = [];

  const pairs = [];
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      if (!isNeighbourPair(cells[i], cells[j])) continue;
      const colGap = Math.abs(cells[i].col - cells[j].col);
      const rowGap = Math.abs(cells[i].row - cells[j].row);
      pairs.push({
        left: cells[i],
        right: cells[j],
        kind: colGap + rowGap === 1 ? 'ortho' : 'diagonal',
      });
    }
  }

  for (const pair of rng.shuffle(pairs)) {
    if (!rng.chance(LINK_CHANCE[pair.kind])) continue;
    if (pair.left.neighbors.length >= 5 || pair.right.neighbors.length >= 5) continue;
    if (!clearsSegment(pair.left, pair.right, cells)) continue;
    link(pair.left, pair.right);
  }

  // у каждой клетки минимум два соседа — берём ближайших из соседей по раскладке
  for (const cell of cells) {
    while (cell.neighbors.length < 2) {
      const nearest = cells
        .filter(other => other !== cell && !cell.neighbors.includes(other.id))
        .filter(other => isNeighbourPair(cell, other))
        .filter(other => clearsSegment(cell, other, cells))
        .sort((a, b) => distanceBetween(cell, a) - distanceBetween(cell, b))[0];
      if (!nearest) break;
      link(cell, nearest);
    }
  }

  // если получилось несколько компонент — сшиваем: сначала соседние клетки, потом любые ближайшие
  let guard = 0;
  while (!isConnected(cells) && guard < cells.length * 2) {
    guard += 1;
    const byId = new Map(cells.map(cell => [cell.id, cell]));
    const componentOf = new Map();
    let index = 0;
    for (const cell of cells) {
      if (componentOf.has(cell.id)) continue;
      const queue = [cell];
      componentOf.set(cell.id, index);
      while (queue.length) {
        const current = queue.shift();
        for (const neighbourId of current.neighbors) {
          if (componentOf.has(neighbourId)) continue;
          componentOf.set(neighbourId, index);
          queue.push(byId.get(neighbourId));
        }
      }
      index += 1;
    }
    let best = null;
    for (const left of cells) {
      for (const right of cells) {
        if (componentOf.get(left.id) === componentOf.get(right.id)) continue;
        if (!clearsSegment(left, right, cells)) continue;
        const adjacent = isNeighbourPair(left, right);
        const distance = distanceBetween(left, right);
        const score = (adjacent ? 0 : 1000) + distance;
        if (!best || score < best.score) best = { left, right, score };
      }
    }
    if (!best) break;
    link(best.left, best.right);
  }

  capDegrees(cells);
  for (const cell of cells) {
    cell.neighbors = [...new Set(cell.neighbors)].sort((a, b) => a - b);
  }
  return cells;
};

/** Больше шести связей у клетки не бывает: лишние (самые длинные) убираем, связность храним. */
const capDegrees = (cells, maxDegree = 6) => {
  const byId = new Map(cells.map(cell => [cell.id, cell]));
  for (let guard = 0; guard < cells.length * 4; guard += 1) {
    const heavy = cells.find(cell => cell.neighbors.length > maxDegree);
    if (!heavy) return;
    const candidates = heavy.neighbors
      .map(id => byId.get(id))
      .filter(other => other && other.neighbors.length > 2)
      .sort(
        (a, b) =>
          Math.hypot(b.x - heavy.x, b.y - heavy.y) - Math.hypot(a.x - heavy.x, a.y - heavy.y),
      );
    const drop = candidates[0];
    if (!drop) return;
    heavy.neighbors = heavy.neighbors.filter(id => id !== drop.id);
    drop.neighbors = drop.neighbors.filter(id => id !== heavy.id);
    if (!isConnected(cells)) {
      link(heavy, drop);
      return;
    }
  }
};

/**
 * Раскладка координат: сетка нужна только как черновик. Каждая клетка получает случайное смещение
 * (до 40% шага) в случайную сторону, поэтому расстояния между соседями разные — поле выглядит
 * хаотичным, а не решёткой. Затем позиции «расслабляются»: слишком близкие пары расталкиваются,
 * чтобы кружки не наезжали друг на друга.
 */
const scatterCells = (cells, rng, jitterPercent = CELL_JITTER) => {
  const placed = cells.map(cell => {
    const angle = ((rng.next() % 360) * Math.PI) / 180;
    const distance = (rng.next() % (jitterPercent + 1)) / 100;
    return {
      ...cell,
      x: 80 + cell.col * CELL_STEP + Math.cos(angle) * CELL_STEP * distance,
      y: 90 + cell.row * CELL_STEP_Y + Math.sin(angle) * CELL_STEP_Y * distance,
    };
  });

  // между кружками должен остаться просвет: иначе не видно линию-соединитель
  const minDistance = CELL_SIZE * 1.25;
  for (let pass = 0; pass < 40; pass += 1) {
    let moved = false;
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const left = placed[i];
        const right = placed[j];
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        let gap = Math.hypot(dx, dy);
        if (gap >= minDistance) continue;
        if (gap < 0.001) {
          dx = 1;
          dy = 0;
          gap = 1;
        }
        const push = (minDistance - gap) / 2;
        left.x -= (dx / gap) * push;
        left.y -= (dy / gap) * push;
        right.x += (dx / gap) * push;
        right.y += (dy / gap) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return placed.map(cell => ({ ...cell, x: Math.round(cell.x), y: Math.round(cell.y) }));
};

const buildCells = (target, rng, options = {}) => {
  const draft = draftCells(target, rng, options);
  // координаты нужны до связей: по ним проверяем, что линия не проходит сквозь третий кружок
  const cells = scatterCells(
    draft.cells.map((cell, index) => ({ ...cell, id: index + 1 })),
    rng,
    options.jitter,
  );
  buildLinks(cells, rng);
  return { cells, width: draft.width, height: draft.height };
};

const byId = nodes => new Map(nodes.map(node => [node.id, node]));

const neighboursOf = (nodes, node) => {
  const index = byId(nodes);
  return (node.neighbors ?? []).map(id => index.get(id)).filter(Boolean);
};

/** Семена стартовых земель: каждое место получает семя на своей стороне поля. */
const pickCoreSeeds = (cells, playerCount, rng) => {
  const seeds = [];
  for (let index = 0; index < playerCount; index += 1) {
    const side = seatSide(index + 1);
    const free = cells.filter(cell => !seeds.includes(cell));
    const onSide = free.filter(cell => sideEdgeSteps(cells, cell, side) <= 1);
    const pool = onSide.length ? onSide : free;
    let best = null;
    for (const cell of pool) {
      const distance = seeds.length
        ? Math.min(
            ...seeds.map(seed => Math.abs(seed.col - cell.col) + Math.abs(seed.row - cell.row)),
          )
        : 0;
      const score = distance * 100 + rng.int(50);
      if (!best || score > best.score) best = { cell, score };
    }
    if (!best) return null;
    seeds.push(best.cell);
  }
  return seeds;
};

/** Малые земли: без номера, семена у краёв, farthest-point от стартовых семян. */
const pickSmallSeeds = (cells, coreSeeds, count, rng, owner, coreCount, required) => {
  const sizes = regionSizes(coreCount, owner);
  const removed = new Set();
  const taken = new Array(coreCount).fill(0);
  const removable = cell => {
    const region = owner.get(cell.id);
    if (region == null || region >= coreCount) return true;
    const rest = new Set(removed).add(cell.id);
    return (
      sizes[region] - taken[region] > required && regionStaysConnected(cells, owner, region, rest)
    );
  };
  const seeds = [...coreSeeds];
  const picked = [];
  while (picked.length < count) {
    const free = cells.filter(cell => !seeds.includes(cell) && removable(cell));
    const edge = free.filter(
      cell =>
        Math.min(
          ...['left', 'right', 'top', 'bottom'].map(side => sideEdgeSteps(cells, cell, side)),
        ) <= 1,
    );
    const pool = edge.length ? edge : free;
    let best = null;
    for (const cell of pool) {
      const distance = Math.min(
        ...seeds.map(seed => Math.abs(seed.col - cell.col) + Math.abs(seed.row - cell.row)),
      );
      const score = distance * 100 + rng.int(20);
      if (!best || score > best.score) best = { cell, score };
    }
    if (!best) return null;
    seeds.push(best.cell);
    picked.push(best.cell);
    const region = owner.get(best.cell.id);
    removed.add(best.cell.id);
    if (region != null && region < coreCount) taken[region] += 1;
  }
  return picked;
};

const regionSizes = (count, owner) => {
  const sizes = new Array(count).fill(0);
  for (const region of owner.values()) sizes[region] += 1;
  return sizes;
};

/**
 * Размеры малых земель: от 1 клетки до самой крупной крупной земли. Свободный запас (клетки, которые
 * крупные земли могут отдать, не оголяя старт) раздаётся случайно: на одном поле малые — островки,
 * на другом — земли не меньше крупных. `minTotal` — сколько клеток малые обязаны забрать, чтобы ни одна
 * крупная земля не превысила предел клеток. Хотя бы одна клетка каждой крупной земли остаётся ей.
 */
const pickSmallSizes = (count, capacity, maxSize, rng, minTotal = count) => {
  const sizes = new Array(count).fill(1);
  if (minTotal > count * maxSize) return null;
  const budget = Math.max(0, capacity - count);
  const floor = Math.max(0, minTotal - count);
  if (floor > budget) return null;
  const extra = floor + rng.int(budget - floor + 1);
  if (!extra || maxSize <= 1) return sizes;
  let left = extra;
  const order = rng.shuffle(sizes.map((_, index) => index));
  while (left > 0) {
    const able = order.filter(index => sizes[index] < maxSize);
    if (!able.length) break;
    sizes[rng.pick(able)] += 1;
    left -= 1;
  }
  return sizes;
};

const touchingRegions = (cells, owner, cell) => [
  ...new Set(
    neighboursOf(cells, cell)
      .filter(other => owner.has(other.id))
      .map(other => owner.get(other.id)),
  ),
];

/**
 * Малые земли вырезаются из уже разложенного поля: так они не могут отрезать крупной земле
 * недоступный кусок (цепочка малых зон поперёк поля оставляла клетки без хозяина).
 *
 * Растём от семени по связям, а не только по его прямым соседям: земля на 3+ клетки должна быть
 * цельным участком. У крупной земли не отнимаем последнюю клетку сверх `required` и клетку,
 * которая разрывает её область на несвязанные куски.
 */
const regionStaysConnected = (cells, owner, region, removeIds) => {
  const removed = removeIds instanceof Set ? removeIds : new Set([removeIds]);
  const members = cells.filter(cell => owner.get(cell.id) === region && !removed.has(cell.id));
  if (members.length <= 1) return true;
  const allowed = new Set(members.map(cell => cell.id));
  const index = byId(cells);
  const seen = new Set([members[0].id]);
  const queue = [members[0]];
  while (queue.length) {
    const cell = queue.shift();
    for (const id of cell.neighbors ?? []) {
      if (!allowed.has(id) || seen.has(id)) continue;
      const other = index.get(id);
      if (!other) continue;
      seen.add(id);
      queue.push(other);
    }
  }
  return seen.size === members.length;
};

const carveSmallZones = (
  cells,
  owner,
  smallSeeds,
  coreCount,
  reserved,
  rng,
  required = 1,
  targets = [],
) => {
  const index = byId(cells);
  for (const [offset, seed] of smallSeeds.entries()) {
    const region = coreCount + offset;
    owner.set(seed.id, region);
    const target = targets[offset] ?? 1;
    let size = 1;
    while (size < target) {
      const sizes = regionSizes(coreCount, owner);
      const frontier = new Set();
      for (const cell of cells) {
        if (owner.get(cell.id) !== region) continue;
        for (const id of cell.neighbors ?? []) {
          const other = index.get(id);
          if (other) frontier.add(other);
        }
      }
      const options = [...frontier].filter(
        cell =>
          !reserved.has(cell.id) &&
          owner.get(cell.id) < coreCount &&
          sizes[owner.get(cell.id)] > required &&
          regionStaysConnected(cells, owner, owner.get(cell.id), cell.id),
      );
      if (!options.length) break;
      const bestSize = Math.max(...options.map(cell => sizes[owner.get(cell.id)]));
      const best = options.filter(cell => sizes[owner.get(cell.id)] === bestSize);
      owner.set(rng.pick(best).id, region);
      size += 1;
    }
  }
  return owner;
};

/** Остаток поля делим между стартовыми землями: всегда отдаём самой маленькой. */
const growCoreZones = (cells, owner, seedCount, coreCount) => {
  while (owner.size < cells.length) {
    const sizes = regionSizes(seedCount, owner);
    let best = null;
    for (const cell of cells) {
      if (owner.has(cell.id)) continue;
      const touching = touchingRegions(cells, owner, cell).filter(region => region < coreCount);
      if (!touching.length) continue;
      const region = touching.reduce((smallest, index) =>
        sizes[index] < sizes[smallest] ? index : smallest,
      );
      const score = sizes[region] * 1000 - touching.length;
      if (!best || score < best.score) best = { cell, region, score };
    }
    if (!best) break;
    owner.set(best.cell.id, best.region);
  }
  return owner;
};

/** Цветные клетки: стыки зон, где на одной клетке оказываются две-три стихии. */
const addMultiCells = (
  cells,
  owner,
  regionTerrains,
  rng,
  { regionSizes = [], coreCount = 0 } = {},
) => {
  const neighboursTerrains = (cell, own) => [
    ...new Set(
      neighboursOf(cells, cell)
        .map(other => owner.get(other.id))
        .filter(region => region !== own)
        .map(region => regionTerrains[region]),
    ),
  ];

  const terrainOfCell = (cell, own) => [
    regionTerrains[own],
    ...neighboursTerrains(cell, own).filter(terrain => terrain !== regionTerrains[own]),
  ];

  const borders = cells
    .map(cell => ({
      cell,
      own: owner.get(cell.id),
      terrains: terrainOfCell(cell, owner.get(cell.id)),
    }))
    .filter(entry => entry.terrains.length > 1);

  const two = borders.filter(entry => entry.terrains.length === 2);
  const three = borders.filter(entry => entry.terrains.length >= 3);
  const wantThree = pickRange(rng, MULTI_CELL_COUNTS.three);
  const wantTwo = pickRange(rng, MULTI_CELL_COUNTS.two);

  const chosen = new Map();
  const countOf = kind => [...chosen.values()].filter(value => value === kind).length;
  const countInRegion = region =>
    [...chosen.keys()].filter(cellId => owner.get(cellId) === region).length;
  // У малой земли оставляем хотя бы одну чистую клетку: 1-клеточную не красим вовсе,
  // у большой малой земли цветных может быть сколько угодно, кроме последней.
  const canColour = entry => {
    if (entry.own < coreCount) return true;
    const size = regionSizes[entry.own] ?? 1;
    return countInRegion(entry.own) < Math.max(0, size - 1);
  };
  for (const entry of rng.shuffle(three)) {
    if (countOf(3) >= wantThree) break;
    if (!canColour(entry)) continue;
    chosen.set(entry.cell.id, 3);
  }
  for (const entry of rng.shuffle(two)) {
    if (countOf(2) >= wantTwo) break;
    if (chosen.has(entry.cell.id) || !canColour(entry)) continue;
    chosen.set(entry.cell.id, 2);
  }

  // Цвета берём у «чистых» соседей: тогда рядом с клеткой точно есть клетка этого цвета.
  const pureTerrainsAround = (cell, own) =>
    [
      ...new Set(
        neighboursOf(cells, cell)
          .filter(other => !chosen.has(other.id))
          .map(other => regionTerrains[owner.get(other.id)]),
      ),
    ].filter(terrain => terrain !== regionTerrains[own]);

  // Запасной путь для трёхцветной клетки: если тройного стыка чистых зон нет, третий цвет
  // берём у соседа с цветной клеткой — он всё равно остаётся соседним.
  const anyTerrainsAround = (cell, own) => neighboursTerrains(cell, own);

  return cells.map(cell => {
    const own = owner.get(cell.id);
    const extra = chosen.get(cell.id);
    if (!extra) return { ...cell, terrain: regionTerrains[own] };

    let terrains = [regionTerrains[own], ...pureTerrainsAround(cell, own)];
    if (extra > terrains.length - 1) {
      terrains = [
        regionTerrains[own],
        ...anyTerrainsAround(cell, own).filter(terrain => terrain !== regionTerrains[own]),
      ];
    }
    const limited = terrains.slice(0, Math.min(extra, terrains.length));
    return { ...cell, terrain: limited.length > 1 ? limited : regionTerrains[own] };
  });
};

const terrainList = node => {
  const raw = node?.terrain;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return list.filter(Boolean).map(String);
};

/** Земля без разрывов: все её клетки достижимы по связям, проходя только по той же стихии. */
const brokenTerrain = nodes => {
  const cells = nodes ?? [];
  const index = new Map(cells.map(cell => [String(cell.id), cell]));
  const terrains = new Set(cells.flatMap(terrainList));
  for (const terrain of terrains) {
    const members = cells.filter(cell => terrainList(cell).includes(terrain));
    if (members.length <= 1) continue;
    const allowed = new Set(members.map(cell => String(cell.id)));
    const seen = new Set([String(members[0].id)]);
    const queue = [members[0]];
    while (queue.length) {
      const cell = queue.shift();
      for (const raw of cell.neighbors ?? []) {
        const key = String(raw);
        if (!allowed.has(key) || seen.has(key)) continue;
        const other = index.get(key);
        if (!other) continue;
        seen.add(key);
        queue.push(other);
      }
    }
    if (seen.size !== allowed.size) return terrain;
  }
  return null;
};

const primaryTerrain = node => terrainList(node)[0] ?? null;

/**
 * Предел клеток на землю: цветная клетка принадлежит сразу двум-трём землям, поэтому после стыков
 * одна земля может перебрать десять клеток. Лишние цвета снимаем с цветных клеток (свою стихию
 * клетки не трогаем), пока каждая земля не уложится в предел.
 */
const limitTerrainFootprint = (cells, max = MAX_TERRAIN_CELLS) => {
  const out = cells.map(cell => ({ ...cell }));
  const counts = new Map();
  for (const cell of out) {
    for (const terrain of terrainList(cell)) {
      counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const cell of out) {
      const list = terrainList(cell);
      if (list.length < 2) continue;
      const extra = list.slice(1).find(terrain => (counts.get(terrain) ?? 0) > max);
      if (!extra) continue;
      counts.set(extra, counts.get(extra) - 1);
      const next = list.filter(terrain => terrain !== extra);
      cell.terrain = next.length === 1 ? next[0] : next;
      changed = true;
      break;
    }
  }
  return out;
};

/**
 * Прямые линии между соседними клетками одной земли: связность маршрутом — не то же самое, что
 * «клетки связаны» (жалоба владельца). Пары, которым линия не влезает (третий кружок на отрезке или
 * предел связей), считаем провалом раскладки — поле с ними не отдаём.
 */
const linkSameTerrain = (cells, maxDegree = MAX_CELL_LINKS) => {
  let blocked = 0;
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const left = cells[i];
      const right = cells[j];
      if (!isNeighbourPair(left, right)) continue;
      if (primaryTerrain(left) !== primaryTerrain(right)) continue;
      if (left.neighbors.includes(right.id)) continue;
      if (
        left.neighbors.length >= maxDegree ||
        right.neighbors.length >= maxDegree ||
        !clearsSegment(left, right, cells)
      ) {
        blocked += 1;
        continue;
      }
      link(left, right);
    }
  }
  return blocked;
};

/**
 * Одноцветная клетка. **Номерная клетка обязана быть одноцветной** (правило владельца): по её стихии
 * считается вся область расстановки, и на стыке зон (двух- и трёхцветная клетка) место игрока тянуло бы
 * за собой сразу две-три области — расстановка переставала бы быть «своей» зоной.
 */
export const isSingleTerrainCell = node => terrainList(node).length === 1;

/** Клетки области: все клетки с общей стихией у указанной клетки. */
export const areaCellIds = (map, cellId) => {
  const cells = map?.nodes ?? [];
  const start = cells.find(node => String(node.id) === String(cellId));
  if (!start) return [];
  const terrains = terrainList(start);
  return cells
    .filter(node => terrainList(node).some(terrain => terrains.includes(terrain)))
    .map(node => String(node.id));
};

/** Номерная клетка места: `heroStart` с `position` = порядок игрока. */
export const numberedCellOf = (map, playerOrder) =>
  (map?.nodes ?? []).find(
    node => node.heroStart === true && Number(node.position) === Number(playerOrder),
  ) ?? null;

/**
 * Клетки одной стихии стоят рядом: считаем **связную область** вокруг клетки (только общая стихия,
 * через соседей по связям). Так работает расстановка: помощники встают в область героя, и она должна
 * быть цельным участком поля, а не россыпью по всей карте (правило владельца).
 */
export const terrainAreaCellIds = (nodes, cellId) => {
  const byId = new Map((nodes ?? []).map(node => [String(node.id), node]));
  const start = byId.get(String(cellId));
  if (!start) return [];
  const terrains = terrainList(start);

  const area = new Set([String(start.id)]);
  const queue = [start];
  while (queue.length) {
    const cell = queue.shift();
    for (const raw of cell.neighbors ?? []) {
      const key = String(raw);
      if (area.has(key)) continue;
      const other = byId.get(key);
      if (!other) continue;
      if (!terrainList(other).some(terrain => terrains.includes(terrain))) continue;
      area.add(key);
      queue.push(other);
    }
  }
  return [...area];
};

const chooseStarts = (
  nodes,
  owner,
  regionTerrains,
  playerCount,
  rng,
  {
    regionSizes = null,
    required = 1,
    packs = null,
    layoutWidth = null,
    layoutHeight = null,
    startRegions = null,
  } = {},
) => {
  const cells = nodes ?? [];
  const map = { nodes: cells };
  /**
   * Уже занятые клетки выбранных стартов: клетка на стыке зон принадлежит двум областям, поэтому
   * «своё» место считается по областям, а не по стихиям. Пустая область у чужого старта — та же беда:
   * помощники соседа займут клетки первыми, и своим бойцам ставить будет некуда.
   */
  const takenAreas = new Set();
  const exclusiveRoom = cell => {
    const area = areaCellIds(map, cell.id);
    return area.filter(id => !takenAreas.has(String(id))).length;
  };
  const centre = cells.reduce(
    (acc, cell) => ({
      x: acc.x + cell.x / cells.length,
      y: acc.y + cell.y / cells.length,
    }),
    { x: 0, y: 0 },
  );
  const directions = Array.from({ length: playerCount }, (_, index) => {
    const position = index + 1;
    return { position, side: seatSide(position) };
  });
  const used = new Set();
  /** Старт места стоит у **своей** стороны: в крайней колонке (строке) поля или в следующей от неё. */
  const sideDepth = (cell, side) => sideEdgeSteps(cells, cell, side);
  const onSide = (cell, side) => sideDepth(cell, side) <= 1;
  /**
   * Старты разведены **по шагам поля** (`START_GAP_STEPS`): с номерной клетки никто не должен доставать
   * чужую — наибольшая дальность атаки 3. Пиксельное расстояние для этого не годится: две клетки могут
   * стоять через весь экран и быть соседями по связям (жалоба владельца: места 2 и 3 встали рядом,
   * и герои начали бить друг друга с первого хода).
   */
  const gapFrom = (cell, list) =>
    Math.min(
      ...list.map(other => stepsBetween(cells, other.id, cell.id) ?? Number.POSITIVE_INFINITY),
    );
  const gapEnough = (cell, list) => list.length === 0 || gapFrom(cell, list) >= START_GAP_STEPS;
  const starts = [];

  for (const { side } of directions) {
    // Годятся обе клетки у края: и крайняя, и вторая от неё. Какую взять — решает сид, иначе старт
    // всегда прилипает к самой крайней клетке и поле выглядит одинаково на всех партиях.
    const preferredDepth = rng.int(2);
    const ownRequired = packs?.[starts.length] ?? required;
    const scoreOf = gap => cell => {
      // на старт годится зона, в которой хватит места всем бойцам стороны
      const roomy = regionSizes == null || (regionSizes.get(owner.get(cell.id)) ?? 0) >= required;
      // и своего места в области: чужие клетки на стыке зон своими не считаются
      const own = exclusiveRoom(cell) >= ownRequired;
      // глубину выбираем по сиду, а расстояние до чужих стартов просто помогает не сбиться в кучу
      const depth = sideDepth(cell, side);
      const separation = starts.length
        ? Math.min(...starts.map(start => Math.hypot(start.x - cell.x, start.y - cell.y)))
        : CELL_STEP * 4;
      return (
        (depth === preferredDepth ? 120 : 0) +
        Math.min(separation, CELL_STEP * 4) / 2 +
        // из годных по шагам стартов предпочитаем самый дальний: разведённые места читаются лучше
        (gap ? Math.min(gap, START_GAP_STEPS * 2) * 20 : 0) +
        (roomy ? 40 : 0) +
        (own ? 60 : 0) +
        rng.int(20)
      );
    };

    const ranked = cells
      .filter(cell => !used.has(cell.id))
      // стартовая земля места: номерная клетка стоит в своей крупной земле, а не в малой
      .filter(cell => startRegions == null || startRegions[starts.length] === owner.get(cell.id))
      // номерная клетка — только одноцветная: цветную на стыке зон на старт не берём
      .filter(isSingleTerrainCell)
      // и у клетки должна быть **связная область** хотя бы на всех бойцов стороны: иначе помощники
      // вставали бы в разные концы поля, а не в один участок (правило владельца)
      .filter(cell => terrainAreaCellIds(cells, cell.id).length >= required)
      .map(cell => ({ cell, gap: gapFrom(cell, starts) }))
      .map(entry => ({ ...entry, score: scoreOf(entry.gap)(entry.cell) }))
      .sort((left, right) => right.score - left.score);
    // старты, которые стоят от чужих не ближе `START_GAP_STEPS`: из них и выбираем
    const apart = ranked.filter(entry => entry.gap >= START_GAP_STEPS);

    const takenTerrains = new Set(starts.flatMap(start => terrainList(start)));
    // области стартов не пересекаются: иначе две стороны встают на одни и те же клетки
    const disjoint = entry => !terrainList(entry.cell).some(terrain => takenTerrains.has(terrain));

    const mine = entry => onSide(entry.cell, side);
    const ownRoom = entry => exclusiveRoom(entry.cell) >= ownRequired;
    const pick =
      apart.find(entry => mine(entry) && ownRoom(entry) && disjoint(entry)) ??
      apart.find(entry => mine(entry) && ownRoom(entry)) ??
      apart.find(entry => ownRoom(entry)) ??
      apart.find(entry => mine(entry) && disjoint(entry)) ??
      apart.find(mine) ??
      apart[0] ??
      ranked.find(entry => mine(entry) && ownRoom(entry) && gapEnough(entry.cell, starts)) ??
      ranked.find(entry => mine(entry) && disjoint(entry) && gapEnough(entry.cell, starts)) ??
      ranked.find(entry => mine(entry) && gapEnough(entry.cell, starts)) ??
      ranked.find(entry => mine(entry) && ownRoom(entry)) ??
      ranked.find(entry => mine(entry) && disjoint(entry)) ??
      ranked.find(mine) ??
      ranked.find(entry => ownRoom(entry)) ??
      ranked.find(entry => disjoint(entry)) ??
      ranked[0];
    if (!pick) return null;
    used.add(pick.cell.id);
    for (const id of areaCellIds(map, pick.cell.id)) takenAreas.add(String(id));
    starts.push({ ...pick.cell, heroStart: true, position: directions[starts.length].position });
  }

  // жёсткие проверки: старт у своей стороны, области попарно различны, стороны разведены по шагам
  for (let i = 0; i < starts.length; i += 1) {
    if (!onSide(starts[i], directions[i].side)) return null;
    if (!isSingleTerrainCell(starts[i])) return null;
    if (startRegions != null && startRegions[i] !== owner.get(starts[i].id)) return null;
    for (let j = i + 1; j < starts.length; j += 1) {
      const left = terrainList(starts[i]);
      const right = terrainList(starts[j]);
      if (left.some(terrain => right.includes(terrain))) return null;
      if (!gapEnough(starts[j], [starts[i]])) return null;
    }
  }

  return starts;
};

/**
 * Набор земель: земли героев входят обязательно, но ни одна из них не получает крупную землю по праву —
 * крупные выбираются случайно, а недостающая любимая земля добирается малой. Старт к земле не привязан.
 */
const pickTerrains = (playerCount, smallCount, affinities, rng) => {
  const required = [];
  for (const list of affinities) {
    for (const terrain of list ?? []) {
      if (!required.includes(terrain)) required.push(terrain);
    }
  }
  const pool = rng.shuffle(TERRAIN_IDS);
  const core = pool.splice(0, playerCount);
  const missing = required.filter(terrain => !core.includes(terrain));
  while (missing.length > smallCount) {
    const index = core.findIndex(terrain => !required.includes(terrain));
    if (index < 0) break;
    core[index] = missing.shift();
  }
  const rest = rng.shuffle(
    TERRAIN_IDS.filter(terrain => !core.includes(terrain) && !missing.includes(terrain)),
  );
  const small = [...missing, ...rest].slice(0, smallCount);
  return [...rng.shuffle(core), ...rng.shuffle(small)];
};

/**
 * Сгенерировать поле.
 * @param {object} options
 * @param {number} options.players число игроков (2–4)
 * @param {number} options.seed сид партии
 * @param {number[]} [options.fightersPerPlayer] сколько бойцов у каждой стороны (для гарантии стартовой области)
 * @param {string[][]} [options.affinities] земли героев: входят в набор, но старт к ним не привязан
 * @param {number} [options.cells] переопределить число клеток
 * @param {number} [options.zones] переопределить число земель (8–10)
 * @param {string} [options.id] id карты
 */
export const generateMap = ({
  players = 2,
  seed = 1,
  fightersPerPlayer = null,
  affinities = [],
  cells = null,
  zones = null,
  id = 'generated',
} = {}) => {
  const playerCount = Math.max(2, Math.min(4, Number(players) || 2));
  const preset = BOARD_PRESETS[playerCount];

  // Размер и форма выбираются по сиду один раз на карту: разные партии — разные поля.
  const shapeRng = makeRng(Number(seed));
  const targetCells = Number(cells) || pickRange(shapeRng, preset.cells);
  const maxTerrains = Math.min(MAX_TERRAIN_COUNT, TERRAIN_IDS.length);
  const minTerrains = Math.min(MIN_TERRAIN_COUNT, maxTerrains);
  const terrainCount = Math.max(
    minTerrains,
    Math.min(maxTerrains, Number(zones) || pickRange(shapeRng, [minTerrains, maxTerrains])),
  );
  const smallCount = terrainCount - playerCount;
  const shapeRatio = SHAPE_RATIO_RANGE[0] + shapeRng.int(7) * 0.1; // 2.1 … 2.7
  const momentum = 0.45 + shapeRng.int(5) * 0.05; // 0.45 … 0.65
  const jitter = 25 + shapeRng.int(16); // 25 … 40 % шага: раскладка хаотичная, а не решётка
  const fighters = Array.isArray(fightersPerPlayer)
    ? fightersPerPlayer.map(value => Math.max(1, Number(value) || 1))
    : new Array(playerCount).fill(4);
  const required = Math.max(...fighters) + 1;
  const affinityList = Array.from({ length: playerCount }, (_, index) => {
    const raw = Array.isArray(affinities?.[index]) ? affinities[index] : [];
    return raw.map(String).filter(isTerrainId);
  });

  const reasons = [];
  /** Поле, у которого всё сошлось, кроме идеальной вытянутости: держим как запасной вариант. */
  let fallback = null;

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const rng = makeRng(Number(seed) + attempt * 7919);
    const layout = buildCells(targetCells, rng, { shapeRatio, momentum, jitter });
    const { cells: layoutCells, width: layoutWidth, height: layoutHeight } = layout;

    // форма должна быть вытянутой и не плотной: плотная — это опять полотно-прямоугольник
    const spanX =
      Math.max(...layoutCells.map(cell => cell.x)) - Math.min(...layoutCells.map(cell => cell.x));
    const spanY =
      Math.max(...layoutCells.map(cell => cell.y)) - Math.min(...layoutCells.map(cell => cell.y));
    const spanRatio = spanX / spanY;
    const shapeOk = spanRatio >= 1.7 && spanRatio <= 3.4;
    if (!shapeOk) reasons.push('форма не вытянута');
    if (layoutCells.length / (layoutWidth * layoutHeight) > 0.9 && shapeOk) {
      reasons.push('форма слишком плотная');
      continue;
    }

    const coreSeeds = pickCoreSeeds(layoutCells, playerCount, rng);
    if (!coreSeeds) {
      reasons.push('стартовые земли не разложились');
      continue;
    }
    const owner = new Map(coreSeeds.map((seed, index) => [seed.id, index]));
    growCoreZones(layoutCells, owner, playerCount, playerCount);
    if (owner.size !== layoutCells.length) {
      reasons.push('земли не разложились');
      continue;
    }
    const coreSizes = regionSizes(playerCount, owner);
    if (coreSizes.some(size => size < required)) {
      reasons.push('стартовая земля меньше пака');
      continue;
    }
    const smallSeeds = pickSmallSeeds(
      layoutCells,
      coreSeeds,
      smallCount,
      rng,
      owner,
      playerCount,
      required,
    );
    if (!smallSeeds) {
      reasons.push('малые земли не разложились');
      continue;
    }
    const seeds = [...coreSeeds, ...smallSeeds];
    // Малые земли обязаны забрать столько клеток, чтобы ни одна крупная не перешла предел.
    // Запас, который крупные земли могут отдать малым, не оголяя старт.
    const capacity = layoutCells.length - playerCount * required;
    const zoneLimit = Math.min(MAX_TERRAIN_CELLS - 1, Math.max(...coreSizes));
    const minSmallTotal = Math.max(
      smallCount,
      layoutCells.length - playerCount * (MAX_TERRAIN_CELLS - 1),
    );
    const smallTargets = pickSmallSizes(smallCount, capacity, zoneLimit, rng, minSmallTotal);
    if (!smallTargets) {
      reasons.push('малые земли не разложились');
      continue;
    }
    carveSmallZones(
      layoutCells,
      owner,
      smallSeeds,
      playerCount,
      new Set(seeds.map(cell => cell.id)),
      rng,
      required,
      smallTargets,
    );
    const sizes = regionSizes(seeds.length, owner);
    if (sizes.slice(0, playerCount).some(size => size < required)) {
      reasons.push('стартовая земля меньше пака');
      continue;
    }
    if (sizes.slice(playerCount).some(size => size < 1)) {
      reasons.push('малая земля потерялась');
      continue;
    }
    if (sizes.some(size => size > MAX_TERRAIN_CELLS - 1)) {
      reasons.push('земля больше десяти клеток');
      continue;
    }

    const regionTerrains = pickTerrains(playerCount, smallCount, affinityList, rng);
    const nodesWithTerrain = limitTerrainFootprint(
      addMultiCells(layoutCells, owner, regionTerrains, rng, {
        regionSizes: sizes,
        coreCount: playerCount,
      }),
    );
    const brokenArea = brokenTerrain(nodesWithTerrain);
    if (brokenArea) {
      reasons.push(`земля ${brokenArea} разорвана`);
      continue;
    }
    const multiCells = nodesWithTerrain.filter(node => terrainList(node).length > 1);
    const threeColour = multiCells.filter(node => terrainList(node).length === 3).length;
    const twoColour = multiCells.filter(node => terrainList(node).length === 2).length;
    if (threeColour < MULTI_CELL_COUNTS.three[0] || threeColour > MULTI_CELL_COUNTS.three[1]) {
      reasons.push('трёхцветных клеток не по правилу');
      continue;
    }
    if (twoColour < MULTI_CELL_COUNTS.two[0] || twoColour > MULTI_CELL_COUNTS.two[1]) {
      reasons.push('двухцветных клеток не по правилу');
      continue;
    }
    const footprint = new Map();
    for (const node of nodesWithTerrain) {
      for (const terrain of terrainList(node)) {
        footprint.set(terrain, (footprint.get(terrain) ?? 0) + 1);
      }
    }
    const tooWide = [...footprint].find(([, count]) => count > MAX_TERRAIN_CELLS);
    if (tooWide) {
      reasons.push(`земля ${tooWide[0]} занимает больше ${MAX_TERRAIN_CELLS} клеток`);
      continue;
    }
    const provisional = { id, nodes: nodesWithTerrain };

    const starts = chooseStarts(nodesWithTerrain, owner, regionTerrains, playerCount, rng, {
      regionSizes: new Map(sizes.map((size, index) => [index, size])),
      required,
      packs: fighters,
      layoutWidth,
      layoutHeight,
      startRegions: Array.from({ length: playerCount }, (_, index) => index),
    });
    if (!starts) {
      reasons.push('стартовые клетки не выбрались');
      continue;
    }

    // Стартовые области могут соприкасаться (клетки на стыке зон принадлежат обеим), поэтому считаем
    // **свои** клетки: чужой помощник может занять общую клетку первым, и своим бойцам места не останется
    // (сид 18 на четверых: помощники Ифрита заняли область Медузы, и расстановка встала без хода).
    const startAreas = starts.map(start => new Set(areaCellIds(provisional, start.id)));
    const ownRoom = starts.every((start, index) => {
      const foreign = new Set(
        startAreas.filter((_, otherIndex) => otherIndex !== index).flatMap(area => [...area]),
      );
      return (
        [...startAreas[index]].filter(id => !foreign.has(String(id))).length >= fighters[index]
      );
    });
    if (!ownRoom) {
      reasons.push('в стартовой области мало своих клеток');
      continue;
    }

    // Прямые линии добавляем после выбора стартов: они сокращают путь по полю, и разведение
    // проверяем уже на итоговом графе — иначе места сблизятся незаметно для прежних проверок.
    const unlinked = linkSameTerrain(nodesWithTerrain);
    if (unlinked) {
      reasons.push('соседние клетки одной земли не связаны линией');
      continue;
    }
    const startGapOk = starts.every((start, index) =>
      starts.every(
        (_, other) =>
          other === index ||
          (stepsBetween(nodesWithTerrain, start.id, starts[other].id) ?? 0) >= START_GAP_STEPS,
      ),
    );
    if (!startGapOk) {
      reasons.push('связи одной земли сблизили старты');
      continue;
    }
    const neighbourAfterLinks = starts.every((start, index) => {
      const neighbours = new Set((start.neighbors ?? []).map(String));
      return starts.every((_, other) =>
        other === index ? true : ![...startAreas[other]].some(id => neighbours.has(String(id))),
      );
    });
    if (!neighbourAfterLinks) {
      reasons.push('связь одной земли положила чужую клетку вплотную к номеру');
      continue;
    }

    const startById = new Map(starts.map(start => [start.id, start]));
    const nodes = nodesWithTerrain.map(node =>
      startById.has(node.id) ? { ...node, ...startById.get(node.id) } : node,
    );

    // клетки без стихии быть не должно: такая клетка не попала бы ни в одну область,
    // а рисовать её было бы нечем — поле не принимаем
    const broken = nodes.find(node => {
      const list = terrainList(node);
      return list.length === 0 || list.some(id => !isTerrainId(id));
    });
    if (broken) {
      reasons.push(`клетка ${broken.id} без стихии`);
      continue;
    }

    const result = {
      id,
      name: `Поле на ${playerCount} игроков`,
      players: playerCount,
      generated: true,
      seed: Number(seed),
      settings: { nodeSize: CELL_SIZE, gridScale: 1 },
      // служебные данные раскладки: размер и стихия каждой земли, крупная она или малая
      zoneSizes: sizes,
      zoneTerrains: regionTerrains,
      zoneKinds: [...new Array(playerCount).fill('core'), ...new Array(smallCount).fill('small')],
      nodes,
    };
    if (shapeOk) return result;
    if (!fallback) fallback = result;
  }

  // идеальной вытянутости не нашлось — отдаём поле, где всё остальное в порядке
  if (fallback) return fallback;

  throw new Error(
    `генератор: не удалось собрать поле (игроков ${playerCount}, сид ${seed}): ${reasons.join(', ')}`,
  );
};

export default generateMap;
