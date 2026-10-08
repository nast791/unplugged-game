import { TERRAIN_IDS, isTerrainId } from '#shared/constants/terrain.js';
import { seatSide } from '#shared/constants/seats.js';

/**
 * Генератор полей: раскладка клеток + зоны стихий + симметричные стартовые клетки, всё от сида партии.
 *
 * Ориентиры — настоящие поля Unmatched (`.refs/maps`, посчитала владелица игры): всего 28–38 клеток
 * и 6–8 зон, на любое такое поле помещаются все шесть наших стихий. Оттуда же анатомия раскладки:
 * кружки стоят **не по сетке** — со смещениями, и связи между ними разные (у клетки 2–5 соседей,
 * встречаются диагонали и длинные линии). Поэтому зоны выходят неровными, а поле не выглядит
 * зеркальным. Отсюда параметры:
 *  - клеток по числу игроков: 2 → 30, 3 → 32, 4 → 34 (внутри диапазона 28–38);
 *  - зон 6–8; у нас шесть типов стихий, поэтому лишние зоны повторяют стихию — это отдельные участки
 *    поля, но для правил одна область (область = стихия);
 *  - минимум 4 клетки на зону («3 клетки на стихию — мало»);
 *  - клеток с двумя и тремя стихиями немного (≤ 15%), но хотя бы одна двухцветная и одна трёхцветная
 *    обязательны — как расколотые кружки на стыках зон в референсе;
 *  - стартовые клетки симметричны: двое — противоположные стороны, трое — треугольник, четверо — углы.
 *    Герой встаёт на номерную клетку, помощники — в его области, поэтому у стартовой области каждой
 *    стороны должно хватать клеток на всех её бойцов.
 *
 * Генератор чистый: тот же сид и те же параметры — та же карта.
 */

/**
 * Ориентиры с настоящих полей Unmatched: клеток у 2 игроков 28–32, у 4 героев 28–38, зон 6–8.
 * Поэтому число клеток и зон выбирается **случайно в диапазоне** по сиду партии, а не фиксировано:
 * два поля с разными сидами отличаются и размером, и формой.
 */
export const BOARD_PRESETS = {
  2: { cells: [28, 32], zones: [6, 7] },
  3: { cells: [30, 34], zones: [6, 7] },
  4: { cells: [30, 38], zones: [6, 8] },
};

/** Минимум клеток в зоне. */
export const MIN_ZONE_CELLS = 4;
/**
 * Границы **ручного** размера поля (клетки): «Авто» отдаёт размер сиду по пресетам ниже, а игрок может
 * задать число сам. Меньше 28 — пусто (шесть зон по четыре клетки не набираются), больше 38 — полотно
 * вместо поля (ориентир настоящих полей Unmatched — 28–38).
 */
export const CELLS_LIMIT = { min: 28, max: 38 };
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
/** Сколько раз пробуем другой расклад, если не сошлись гарантии. */
const ATTEMPTS = 60;

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

/** Семена зон: farthest-point sampling, чтобы зоны были разбросаны по полю. */
const pickSeeds = (cells, count, rng) => {
  const seeds = [rng.pick(cells)];
  while (seeds.length < count) {
    let best = null;
    for (const cell of cells) {
      if (seeds.includes(cell)) continue;
      const distance = Math.min(
        ...seeds.map(seed => Math.abs(seed.col - cell.col) + Math.abs(seed.row - cell.row)),
      );
      const score = distance * 100 + rng.int(50);
      if (!best || score > best.score) best = { cell, score };
    }
    if (!best) break;
    seeds.push(best.cell);
  }
  return seeds;
};

/** Раскладываем клетки по зонам: растём от семян, всегда от самой маленькой зоны. */
const growZones = (cells, seeds) => {
  const owner = new Map(seeds.map((seed, index) => [seed.id, index]));
  const sizes = () =>
    seeds.map((_, index) => [...owner.values()].filter(value => value === index).length);

  while (owner.size < cells.length) {
    const sizesNow = sizes();
    let best = null;
    for (const cell of cells) {
      if (owner.has(cell.id)) continue;
      const touching = [
        ...new Set(
          neighboursOf(cells, cell)
            .filter(other => owner.has(other.id))
            .map(other => owner.get(other.id)),
        ),
      ];
      if (touching.length === 0) continue;
      const region = touching.reduce((smallest, index) =>
        sizesNow[index] < sizesNow[smallest] ? index : smallest,
      );
      const score = sizesNow[region] * 1000 - touching.length;
      if (!best || score < best.score) best = { cell, region, score };
    }
    if (!best) break;
    owner.set(best.cell.id, best.region);
  }
  return owner;
};

/**
 * Маленькие зоны: сначала пробуем отобрать клетку у соседа, который выдержит потерю,
 * а если такого нет — вливаем зону в самую большую соседнюю (зон станет меньше).
 */
const repairZones = (cells, owner, regionCount) => {
  const sizes = () => {
    const list = new Array(regionCount).fill(0);
    for (const region of owner.values()) list[region] += 1;
    return list;
  };

  for (let guard = 0; guard < cells.length * regionCount; guard += 1) {
    const list = sizes();
    const small = list.findIndex((size, index) => size > 0 && size < MIN_ZONE_CELLS);
    if (small < 0) return true;

    let moved = false;
    for (const cell of cells) {
      if (owner.get(cell.id) !== small) continue;
      const donors = [
        ...new Set(neighboursOf(cells, cell).map(other => owner.get(other.id))),
      ].filter(region => region !== small && list[region] > MIN_ZONE_CELLS);
      if (donors.length === 0) continue;
      const donor = donors.reduce((biggest, region) =>
        list[region] > list[biggest] ? region : biggest,
      );
      owner.set(cell.id, donor);
      moved = true;
      break;
    }
    if (moved) continue;

    const members = cells.filter(cell => owner.get(cell.id) === small);
    const neighbours = [
      ...new Set(
        members.flatMap(cell => neighboursOf(cells, cell).map(other => owner.get(other.id))),
      ),
    ].filter(region => region !== small && list[region] > 0);
    if (neighbours.length === 0) return false;
    const host = neighbours.reduce((biggest, region) =>
      list[region] > list[biggest] ? region : biggest,
    );
    for (const cell of members) owner.set(cell.id, host);
  }
  return false;
};

/** Цветные клетки: стыки зон, где на одной клетке оказываются две-три стихии. */
const addMultiCells = (cells, owner, regionTerrains, rng) => {
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
  for (const entry of rng.shuffle(three)) {
    if (countOf(3) >= wantThree) break;
    chosen.set(entry.cell.id, 3);
  }
  for (const entry of rng.shuffle(two)) {
    if (countOf(2) >= wantTwo) break;
    if (!chosen.has(entry.cell.id)) chosen.set(entry.cell.id, 2);
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

const chooseStarts = (
  cells,
  owner,
  regionTerrains,
  playerCount,
  rng,
  { regionSizes = null, required = 1, layoutWidth = null, layoutHeight = null } = {},
) => {
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
  /** Насколько стороны должны быть разведены: двое — почти через всё поле, остальные — на 2 клетки. */
  const gapSteps = playerCount === 2 ? 3.5 : 2;
  const starts = [];

  for (const { side } of directions) {
    // Годятся обе клетки у края: и крайняя, и вторая от неё. Какую взять — решает сид, иначе старт
    // всегда прилипает к самой крайней клетке и поле выглядит одинаково на всех партиях.
    const preferredDepth = rng.int(2);
    const scoreOf = cell => {
      // на старт годится зона, в которой хватит места всем бойцам стороны
      const roomy = regionSizes == null || (regionSizes.get(owner.get(cell.id)) ?? 0) >= required;
      // глубину выбираем по сиду, а расстояние до чужих стартов просто помогает не сбиться в кучу
      const depth = sideDepth(cell, side);
      const separation = starts.length
        ? Math.min(...starts.map(start => Math.hypot(start.x - cell.x, start.y - cell.y)))
        : CELL_STEP * 4;
      return (
        (depth === preferredDepth ? 120 : 0) +
        Math.min(separation, CELL_STEP * 4) / 2 +
        (roomy ? 40 : 0) +
        rng.int(20)
      );
    };

    const ranked = cells
      .filter(cell => !used.has(cell.id))
      .map(cell => ({ cell, score: scoreOf(cell) }))
      .sort((left, right) => right.score - left.score);

    const takenTerrains = new Set(starts.flatMap(start => terrainList(start)));
    // области стартов не пересекаются: иначе две стороны встают на одни и те же клетки
    const disjoint = entry => !terrainList(entry.cell).some(terrain => takenTerrains.has(terrain));
    // старты не сбиваются в кучу: держим заданную дистанцию, при неудаче — три четверти от неё
    const gapEnough = gap => entry =>
      starts.every(
        start => Math.hypot(start.x - entry.cell.x, start.y - entry.cell.y) >= CELL_STEP * gap,
      );

    const mine = entry => onSide(entry.cell, side);
    const pick =
      ranked.find(entry => mine(entry) && disjoint(entry) && gapEnough(gapSteps)(entry)) ??
      ranked.find(entry => mine(entry) && gapEnough(gapSteps)(entry)) ??
      ranked.find(entry => mine(entry) && disjoint(entry)) ??
      ranked.find(mine) ??
      ranked.find(entry => disjoint(entry) && gapEnough(gapSteps)(entry)) ??
      ranked.find(gapEnough(gapSteps)) ??
      ranked.find(disjoint) ??
      ranked[0];
    if (!pick) return null;
    used.add(pick.cell.id);
    starts.push({ ...pick.cell, heroStart: true, position: directions[starts.length].position });
  }

  // жёсткие проверки: старт у своей стороны, области попарно различны, стороны разведены
  for (let i = 0; i < starts.length; i += 1) {
    if (!onSide(starts[i], directions[i].side)) return null;
    for (let j = i + 1; j < starts.length; j += 1) {
      const left = terrainList(starts[i]);
      const right = terrainList(starts[j]);
      if (left.some(terrain => right.includes(terrain))) return null;
      const gap = Math.hypot(starts[i].x - starts[j].x, starts[i].y - starts[j].y);
      if (gap < CELL_STEP * gapSteps) return null;
    }
  }

  return starts;
};

/**
 * Сгенерировать поле.
 * @param {object} options
 * @param {number} options.players число игроков (2–4)
 * @param {number} options.seed сид партии
 * @param {number[]} [options.fightersPerPlayer] сколько бойцов у каждой стороны (для гарантии стартовой области)
 * @param {number} [options.cells] переопределить число клеток
 * @param {number} [options.zones] переопределить число зон
 * @param {string} [options.id] id карты
 */
export const generateMap = ({
  players = 2,
  seed = 1,
  fightersPerPlayer = null,
  cells = null,
  zones = null,
  id = 'generated',
} = {}) => {
  const playerCount = Math.max(2, Math.min(4, Number(players) || 2));
  const preset = BOARD_PRESETS[playerCount];

  // Размер и форма выбираются по сиду один раз на карту: разные партии — разные поля.
  const shapeRng = makeRng(Number(seed));
  const targetCells = Number(cells) || pickRange(shapeRng, preset.cells);
  const zoneCount = Math.max(6, Math.min(8, Number(zones) || pickRange(shapeRng, preset.zones)));
  const shapeRatio = SHAPE_RATIO_RANGE[0] + shapeRng.int(7) * 0.1; // 2.1 … 2.7
  const momentum = 0.45 + shapeRng.int(5) * 0.05; // 0.45 … 0.65
  const jitter = 25 + shapeRng.int(16); // 25 … 40 % шага: раскладка хаотичная, а не решётка
  const fighters = Array.isArray(fightersPerPlayer)
    ? fightersPerPlayer.map(value => Math.max(1, Number(value) || 1))
    : new Array(playerCount).fill(4);

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

    const seeds = pickSeeds(layoutCells, zoneCount, rng);
    const owner = growZones(layoutCells, seeds);
    if (owner.size !== layoutCells.length) {
      reasons.push('зоны не разложились');
      continue;
    }
    if (!repairZones(layoutCells, owner, seeds.length)) {
      reasons.push('зона меньше минимума');
      continue;
    }

    const sizeOf = region => [...owner.values()].filter(value => value === region).length;
    const usedRegions = [...new Set(owner.values())].sort(
      (left, right) => sizeOf(right) - sizeOf(left),
    );
    if (usedRegions.length < 6) {
      reasons.push('после слияния зон осталось меньше шести');
      continue;
    }

    // у стихий нет привилегий: все шесть тасуются и раздаются зонам по порядку, а зоны сверх шести
    // (их бывает 7–8) берут случайную стихию. Повтор стихии в двух зонах допустим, «фоновой» нет.
    const terrainOrder = rng.shuffle(TERRAIN_IDS);
    const regionTerrains = new Array(seeds.length).fill(null);
    usedRegions.forEach((region, index) => {
      regionTerrains[region] =
        index < terrainOrder.length ? terrainOrder[index] : rng.pick(TERRAIN_IDS);
    });
    const usedTerrains = usedRegions.map(region => regionTerrains[region]);
    const regionSizes = new Map(usedRegions.map(region => [region, sizeOf(region)]));

    const nodesWithTerrain = addMultiCells(layoutCells, owner, regionTerrains, rng);
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
    const provisional = { id, nodes: nodesWithTerrain };

    const starts = chooseStarts(nodesWithTerrain, owner, regionTerrains, playerCount, rng, {
      regionSizes,
      required: Math.max(...fighters) + 1,
      layoutWidth,
      layoutHeight,
    });
    if (!starts) {
      reasons.push('стартовые клетки не выбрались');
      continue;
    }

    // Стартовые области могут соприкасаться (клетки на стыке зон принадлежат обеим), поэтому
    // считаем не «свои» клетки, а свободные: в области должно хватить места и своим бойцам,
    // и чужим героям, которые стоят на номерных клетках внутри неё.
    const startAreas = starts.map(start => new Set(areaCellIds(provisional, start.id)));
    const enoughCells = starts.every((start, index) => {
      const foreignHeroes = starts.filter(
        (other, otherIndex) => otherIndex !== index && startAreas[index].has(String(other.id)),
      ).length;
      return startAreas[index].size >= fighters[index] + foreignHeroes;
    });
    if (!enoughCells) {
      reasons.push('в стартовой области мало клеток');
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
      // служебные данные раскладки: сколько клеток в каждой зоне и какие в ней стихии
      zoneSizes: usedRegions.map(region => sizeOf(region)),
      zoneTerrains: usedTerrains,
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
