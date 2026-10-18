import { describe, expect, it } from 'vitest';
import { createGame } from '../../../server/create.js';
import { load } from '../../../server/party.js';
import {
  BOARD_PRESETS,
  CELL_JITTER,
  CELL_SIZE,
  CELL_STEP,
  CELL_STEP_Y,
  MULTI_CELL_COUNTS,
  MAX_CELL_LINKS,
  MAX_TERRAIN_CELLS,
  MAX_TERRAIN_COUNT,
  MIN_TERRAIN_COUNT,
  START_GAP_STEPS,
  areaCellIds,
  generateMap,
  numberedCellOf,
  stepsBetween,
  terrainAreaCellIds,
} from '#shared/helpers/mapGenerator.js';
import { TERRAIN_IDS } from '#shared/constants/terrain.js';
import { SEAT_SIDES } from '#shared/constants/seats.js';
import { numberedCellId, placementRejection, startAreaCellIds } from '#shared/helpers/placement.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);

const terrainList = node => {
  const raw = node?.terrain;
  return (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).filter(Boolean).map(String);
};

const degree = node => node.neighbors.length;

/** Расстояние от точки до отрезка: по нему проверяем, что линия не идёт сквозь третий кружок. */
const distanceToSegment = (point, left, right) => {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - left.x) * dx + (point.y - left.y) * dy) / lengthSquared),
  );
  return Math.hypot(point.x - (left.x + t * dx), point.y - (left.y + t * dy));
};

const latticeOffsets = map => {
  const xs = map.nodes.map(node => node.x);
  const ys = map.nodes.map(node => node.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return map.nodes.filter(node => {
    const dx = (node.x - minX) % CELL_STEP;
    const dy = (node.y - minY) % CELL_STEP_Y;
    return Math.min(dx, CELL_STEP - dx) > 3 || Math.min(dy, CELL_STEP_Y - dy) > 3;
  });
};

const playersOf = (count, map) =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `P${index + 1}`,
    order: index + 1,
    placementReady: false,
    numberedHeroCommitted: false,
    deck: [],
    hand: [],
    discard: [],
    fighters: [
      fighter({ id: `p${index + 1}-hero`, type: 'hero', currentHp: 10 }),
      fighter({ id: `p${index + 1}-pawn`, type: 'assistant', currentHp: 3 }),
    ],
    map: undefined,
  }));

describe('генератор полей: детерминизм', () => {
  it('тот же сид — то же поле, другой сид — другое', () => {
    const first = generateMap({ players: 2, seed: 11 });
    const same = generateMap({ players: 2, seed: 11 });
    const other = generateMap({ players: 2, seed: 12 });

    expect(JSON.stringify(first)).toBe(JSON.stringify(same));
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(other));
  });

  it('число игроков и зон зажато в допустимые границы', () => {
    expect(generateMap({ players: 6, seed: 3 }).players).toBe(4);
    expect(generateMap({ players: 1, seed: 3 }).players).toBe(2);
    const wide = generateMap({ players: 2, seed: 3, zones: 99 });
    expect(wide.zoneSizes.length).toBe(MAX_TERRAIN_COUNT);
    const narrow = generateMap({ players: 2, seed: 3, zones: 1 });
    expect(narrow.zoneSizes.length).toBe(MIN_TERRAIN_COUNT);
  });
});

describe.each([2, 3, 4])('генератор полей: %i игрока', players => {
  const maps = SEEDS.map(seed => generateMap({ players, seed }));

  it('клеток столько, сколько в ориентире, и у каждой есть координаты', () => {
    const [minCells, maxCells] = BOARD_PRESETS[players].cells;
    for (const map of maps) {
      // размер поля случаен в диапазоне ориентира: одинаковых полей быть не должно
      expect(map.nodes.length).toBeGreaterThanOrEqual(minCells);
      expect(map.nodes.length).toBeLessThanOrEqual(maxCells);
      for (const node of map.nodes) {
        expect(Number.isFinite(node.x)).toBe(true);
        expect(Number.isFinite(node.y)).toBe(true);
        expect(terrainList(node).length).toBeGreaterThanOrEqual(1);
        expect(terrainList(node).length).toBeLessThanOrEqual(3);
        for (const terrain of terrainList(node)) {
          expect(TERRAIN_IDS).toContain(terrain);
        }
      }
    }
  });

  it('размеры и формы полей различаются: карта зависит от сида', () => {
    const sizes = new Set(maps.map(map => map.nodes.length));
    expect(sizes.size).toBeGreaterThan(1);
    const shapes = new Set(
      maps.map(map => map.nodes.map(node => `${node.col}:${node.row}`).join('|')),
    );
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('на поле 8–10 разных земель: крупные по числу игроков, малые — от 1 клетки до крупной', () => {
    const smallSizes = [];
    for (const map of maps) {
      expect(map.zoneSizes.length).toBeGreaterThanOrEqual(MIN_TERRAIN_COUNT);
      expect(map.zoneSizes.length).toBeLessThanOrEqual(MAX_TERRAIN_COUNT);
      expect(map.zoneKinds.length).toBe(map.zoneSizes.length);
      expect(map.zoneTerrains.length).toBe(map.zoneSizes.length);
      // каждая земля своя: две зоны одной стихии на поле не встречаются
      expect(new Set(map.zoneTerrains).size).toBe(map.zoneSizes.length);
      expect(map.zoneKinds.filter(kind => kind === 'core').length).toBe(players);

      const used = new Set(map.nodes.flatMap(terrainList));
      expect([...used].sort()).toEqual([...map.zoneTerrains].sort());
      for (const [zone, size] of map.zoneSizes.entries()) {
        if (map.zoneKinds[zone] === 'core') {
          // стартовая земля обязана вместить героя и помощников: максимум пака — 4 бойца, плюс запас
          expect(size, `крупная земля ${map.zoneTerrains[zone]}`).toBeGreaterThanOrEqual(5);
        } else {
          // малая — это земля без номера, а не обязательно 1–2 клетки: она может догнать крупную
          expect(size, `малая земля ${map.zoneTerrains[zone]}`).toBeGreaterThanOrEqual(1);
          smallSizes.push(size);
          // цветных клеток у малой может быть сколько угодно, кроме последней: чистый островок остаётся
          expect(
            map.nodes.some(node => {
              const list = terrainList(node);
              return list.length === 1 && list[0] === map.zoneTerrains[zone];
            }),
            `малая земля ${map.zoneTerrains[zone]} осталась без чистой клетки`,
          ).toBe(true);
        }
      }
      expect(map.zoneSizes.reduce((sum, size) => sum + size, 0)).toBe(map.nodes.length);
    }
    expect(Math.max(...smallSizes), 'малые земли не ограничены двумя клетками').toBeGreaterThan(2);
  });

  it('один тип земли занимает не больше десяти клеток поля', () => {
    for (const map of maps) {
      const counts = new Map();
      for (const node of map.nodes) {
        for (const terrain of terrainList(node)) {
          counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
        }
      }
      for (const [terrain, count] of counts) {
        expect(count, `земля ${terrain} заняла ${count} клеток`).toBeLessThanOrEqual(
          MAX_TERRAIN_CELLS,
        );
      }
      for (const [zone, size] of map.zoneSizes.entries()) {
        expect(size, `зона ${map.zoneTerrains[zone]}`).toBeLessThanOrEqual(MAX_TERRAIN_CELLS);
      }
    }
  });

  it('клетки одной земли связаны между собой: разрывов нет', () => {
    for (const map of maps) {
      const index = new Map(map.nodes.map(node => [node.id, node]));
      for (const terrain of map.zoneTerrains) {
        const members = map.nodes.filter(node => terrainList(node).includes(terrain));
        const start = members[0];
        const seen = new Set([start.id]);
        const queue = [start];
        while (queue.length) {
          const cell = queue.shift();
          for (const id of cell.neighbors) {
            if (seen.has(id)) continue;
            const other = index.get(id);
            if (!other || !terrainList(other).includes(terrain)) continue;
            seen.add(id);
            queue.push(other);
          }
        }
        expect(
          seen.size,
          `земля ${terrain} распалась на куски: ${members.map(node => node.id).join(',')}`,
        ).toBe(members.length);
      }
    }
  });

  it('соседние клетки одной земли соединены прямой линией', () => {
    for (const map of maps) {
      const primary = node => terrainList(node)[0];
      for (let i = 0; i < map.nodes.length; i += 1) {
        for (let j = i + 1; j < map.nodes.length; j += 1) {
          const left = map.nodes[i];
          const right = map.nodes[j];
          const colGap = Math.abs(left.col - right.col);
          const rowGap = Math.abs(left.row - right.row);
          const adjacent = colGap + rowGap === 1 || (colGap === 1 && rowGap === 1);
          if (!adjacent || primary(left) !== primary(right)) continue;
          expect(
            left.neighbors.includes(right.id),
            `клетки ${left.id} и ${right.id} одной земли ${primary(left)} не связаны`,
          ).toBe(true);
        }
      }
    }
  });

  it('земли героев входят в набор, но старт не привязан к своей стихии', () => {
    const affinities = [['desert'], ['lava', 'desert'], ['ice']];
    let offAffinity = 0;
    for (const seed of SEEDS) {
      const map = generateMap({ players: 3, seed, affinities });
      const terrains = new Set(map.zoneTerrains);
      // генератор гарантирует земли предпочтений, даже если герой стоит на другой земле
      for (const list of affinities) {
        for (const terrain of list) expect(terrains.has(terrain), `${seed}:${terrain}`).toBe(true);
      }
      for (let order = 1; order <= 3; order += 1) {
        const start = numberedCellOf(map, order);
        const terrain = terrainList(start)[0];
        if (!affinities[order - 1].includes(terrain)) offAffinity += 1;
      }
    }
    // крупные земли тасуются независимо от порядка игроков: совпадение старта с предпочтением — не правило
    expect(offAffinity).toBeGreaterThan(0);
  }, 30000);

  it('любимая земля может быть малой: крупная не закреплена за героем', () => {
    const affinities = [['ice'], ['desert']];
    const loved = new Set(affinities.flat());
    let smallLoved = 0;
    let offAffinity = 0;
    for (const seed of SEEDS) {
      const map = generateMap({ players: 2, seed, affinities });
      const terrains = new Set(map.zoneTerrains);
      for (const terrain of loved) expect(terrains.has(terrain), `${seed}:${terrain}`).toBe(true);
      map.zoneKinds.forEach((kind, index) => {
        if (kind === 'small' && loved.has(map.zoneTerrains[index])) smallLoved += 1;
      });
      for (let order = 1; order <= 2; order += 1) {
        const terrain = terrainList(numberedCellOf(map, order))[0];
        if (!affinities[order - 1].includes(terrain)) offAffinity += 1;
      }
    }
    expect(smallLoved).toBeGreaterThan(0);
    expect(offAffinity).toBeGreaterThan(0);
  }, 30000);

  it('клетки без стихии не бывает: у каждой клетке есть стихия из палитры', () => {
    for (const map of maps) {
      for (const node of map.nodes) {
        const list = terrainList(node);
        expect(list.length, `клетка ${node.id}`).toBeGreaterThanOrEqual(1);
        expect(list.length).toBeLessThanOrEqual(3);
        for (const terrain of list) expect(TERRAIN_IDS).toContain(terrain);
        expect(new Set(list).size).toBe(list.length);
      }
    }
  });

  it('трёхцветных клеток 1–4, двухцветных 2–8 — как в правилах', () => {
    for (const map of maps) {
      const count = size => map.nodes.filter(node => terrainList(node).length === size).length;
      const three = count(3);
      const two = count(2);

      expect(three, `трёхцветных на карте ${map.id}`).toBeGreaterThanOrEqual(
        MULTI_CELL_COUNTS.three[0],
      );
      expect(three).toBeLessThanOrEqual(MULTI_CELL_COUNTS.three[1]);
      expect(two, `двухцветных на карте ${map.id}`).toBeGreaterThanOrEqual(
        MULTI_CELL_COUNTS.two[0],
      );
      expect(two).toBeLessThanOrEqual(MULTI_CELL_COUNTS.two[1]);
    }
  });

  it('связи взаимные, граф связный, у клетки есть соседи', () => {
    for (const map of maps) {
      const byId = new Map(map.nodes.map(node => [node.id, node]));
      let links = 0;
      for (const node of map.nodes) {
        expect(degree(node)).toBeGreaterThanOrEqual(1);
        expect(degree(node)).toBeLessThanOrEqual(MAX_CELL_LINKS);
        links += degree(node);
        for (const neighbourId of node.neighbors) {
          const neighbour = byId.get(neighbourId);
          expect(neighbour, `клетка ${node.id} → ${neighbourId}`).toBeTruthy();
          expect(neighbour.neighbors).toContain(node.id);
        }
      }
      // тупики бывают, но поле не должно превращаться в цепочку
      expect(links / map.nodes.length).toBeGreaterThanOrEqual(2.2);

      const seen = new Set([map.nodes[0].id]);
      const queue = [map.nodes[0]];
      while (queue.length) {
        const node = queue.shift();
        for (const neighbourId of node.neighbors) {
          if (seen.has(neighbourId)) continue;
          seen.add(neighbourId);
          queue.push(byId.get(neighbourId));
        }
      }
      expect(seen.size).toBe(map.nodes.length);
    }
  });

  it('форма неровная: где-то торчит клетка сбоку, где-то две', () => {
    for (const map of maps) {
      const colOf = node => Math.round((node.x - 80) / CELL_STEP);
      const rowOf = node => Math.round((node.y - 90) / CELL_STEP_Y);
      const cols = [...new Set(map.nodes.map(colOf))];
      const rows = [...new Set(map.nodes.map(rowOf))];
      const rowsLengths = rows.map(row => map.nodes.filter(node => rowOf(node) === row).length);
      const colsLengths = cols.map(col => map.nodes.filter(node => colOf(node) === col).length);

      // ряды и колонки разной длины — это и есть выступы, а не ровный прямоугольник
      expect(Math.max(...rowsLengths) - Math.min(...rowsLengths)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...colsLengths) - Math.min(...colsLengths)).toBeGreaterThanOrEqual(1);
      expect(rows.length).toBeLessThanOrEqual(5);
    }
  });

  it('поле вытянуто по горизонтали: меньше рядов, больше колонок', () => {
    for (const map of maps) {
      const xs = map.nodes.map(node => node.x);
      const ys = map.nodes.map(node => node.y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      // доска вписывается в контейнер, а он шире 16:9: вытянутое поле даёт крупные кружки
      expect(width / height, `поле ${map.id}`).toBeGreaterThanOrEqual(1.7);

      // форма неровная: в габаритной сетке поле занимает не всё место
      const cols = new Set(map.nodes.map(node => Math.round((node.x - 80) / CELL_STEP)));
      const rows = new Set(map.nodes.map(node => Math.round((node.y - 90) / CELL_STEP_Y)));
      expect(rows.size, `рядов ${rows.size}`).toBeLessThanOrEqual(6);
      expect(cols.size, `колонок ${cols.size}`).toBeGreaterThan(rows.size);
      const fill = map.nodes.length / (cols.size * rows.size);
      // форма не полотно: часть габаритной сетки пустует (выступы и впадины)
      expect(fill, `заполнение ${fill}`).toBeLessThan(0.98);
    }
  });

  it('кружок занимает большую часть шага: клетки крупные', () => {
    expect(CELL_SIZE / CELL_STEP).toBeGreaterThanOrEqual(0.6);
    expect(CELL_SIZE / CELL_STEP_Y).toBeGreaterThanOrEqual(0.6);
  });

  it('между соседними кружками остаётся просвет: линия-соединитель видна', () => {
    // шаг минус диаметр — это и есть видимый зазор
    expect(CELL_STEP - CELL_SIZE).toBeGreaterThanOrEqual(CELL_SIZE * 0.4);
    expect(CELL_STEP_Y - CELL_SIZE).toBeGreaterThanOrEqual(CELL_SIZE * 0.3);
  });

  it('стартовые клетки у края поля: на границе или не глубже одной клетки от неё', () => {
    const depthOf = (map, node) => {
      const present = new Set(
        map.nodes.map(
          entry =>
            `${Math.round((entry.x - 80) / CELL_STEP)}:${Math.round((entry.y - 90) / CELL_STEP_Y)}`,
        ),
      );
      const col = Math.round((node.x - 80) / CELL_STEP);
      const row = Math.round((node.y - 90) / CELL_STEP_Y);
      let depth = Infinity;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        let step = 1;
        for (;;) {
          if (!present.has(`${col + dx * step}:${row + dy * step}`)) break;
          step += 1;
        }
        depth = Math.min(depth, step - 1);
      }
      return depth;
    };

    for (const map of maps) {
      for (let order = 1; order <= players; order += 1) {
        const start = numberedCellOf(map, order);
        expect(depthOf(map, start), `старт ${order} на клетке ${start.id}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('стороны разведены по шагам поля: с номерной клетки никто не достаёт чужую', () => {
    // Мера разведения — шаги по связям, а не пиксели: дальность атаки и шага считается BFS по соседям.
    // Наибольшая дальность атаки в игре — 3, поэтому минимум `START_GAP_STEPS` = 4: иначе герои бьют
    // друг друга с номерных клеток на первом же ходу (жалоба владельца на места 2 и 3).
    for (const map of maps) {
      const starts = Array.from({ length: players }, (_, index) => numberedCellOf(map, index + 1));
      for (let i = 0; i < starts.length; i += 1) {
        for (let j = i + 1; j < starts.length; j += 1) {
          const gap = stepsBetween(map.nodes, starts[i].id, starts[j].id);
          expect(gap, `старты ${i + 1} и ${j + 1}`).toBeGreaterThanOrEqual(START_GAP_STEPS);
        }
      }
    }
  });

  it('кружки крупные и не слипаются: соседние клетки дальше двух радиусов', () => {
    const radius = CELL_SIZE / 2;
    for (const map of maps) {
      const byId = new Map(map.nodes.map(node => [node.id, node]));
      for (const node of map.nodes) {
        for (const neighbourId of node.neighbors) {
          const other = byId.get(neighbourId);
          expect(
            Math.hypot(other.x - node.x, other.y - node.y),
            `клетки ${node.id} и ${neighbourId}`,
          ).toBeGreaterThanOrEqual(radius * 2);
        }
      }
    }
  });

  it('у каждой клетки есть хотя бы одна связь, иначе она висит в стороне', () => {
    for (const map of maps) {
      for (const node of map.nodes) {
        expect(node.neighbors.length, `клетка ${node.id}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  // Проверок здесь десятки тысяч (каждая связь против каждой третьей клетки), и под нагрузкой полного
  // прогона они не укладываются в стандартные 5 с — это таймаут, а не падение проверки. Даём запас.
  it('связи не проходят сквозь третьи клетки', () => {
    for (const map of maps) {
      const byId = new Map(map.nodes.map(node => [node.id, node]));
      for (const node of map.nodes) {
        for (const neighbourId of node.neighbors) {
          const other = byId.get(neighbourId);

          for (const third of map.nodes) {
            if (third === node || third === other) continue;
            expect(
              distanceToSegment(third, node, other),
              `линия ${node.id}-${neighbourId} проходит рядом с ${third.id}`,
            ).toBeGreaterThanOrEqual(50);
          }
        }
      }
    }
  }, 30000);

  it('цветные клетки стоят рядом с клетками своих цветов', () => {
    for (const map of maps) {
      const byId = new Map(map.nodes.map(node => [node.id, node]));
      for (const node of map.nodes) {
        const terrains = terrainList(node);
        if (terrains.length < 2) continue;
        const around = new Set(
          node.neighbors.flatMap(neighbourId => terrainList(byId.get(neighbourId))),
        );
        for (const terrain of terrains.slice(1)) {
          expect(around.has(terrain), `клетка ${node.id}: рядом нет ${terrain}`).toBe(true);
        }
      }
    }
  });

  it('раскладка несимметричная: смещения и разные связи', () => {
    for (const map of maps) {
      // кружки не выстроены в идеальную сетку
      expect(latticeOffsets(map).length).toBeGreaterThan(map.nodes.length / 3);
      // у клеток разное число соседей
      const degrees = new Set(map.nodes.map(degree));
      expect(degrees.size).toBeGreaterThan(1);
      expect(Math.max(...degrees)).toBeLessThanOrEqual(MAX_CELL_LINKS);
      // есть связи «не по сетке»: диагональ или длинная линия
      const byId = new Map(map.nodes.map(node => [node.id, node]));
      const exotic = map.nodes.some(node =>
        node.neighbors.some(neighbourId => {
          const neighbour = byId.get(neighbourId);
          const dx = Math.abs(neighbour.x - node.x);
          const dy = Math.abs(neighbour.y - node.y);
          return dx > CELL_STEP / 2 && dy > CELL_STEP / 2;
        }),
      );
      expect(exotic).toBe(true);
      expect(CELL_JITTER).toBeGreaterThan(0);
    }
  });

  it('место игрока задаёт сторону: 1 — слева, 2 — справа, 3 — сверху, 4 — снизу', () => {
    // край считаем по полю: старт стоит в крайней колонке (строке) поля или в следующей от неё,
    // то есть максимум второй от края
    const edgeSteps = (map, node, side) => {
      const cols = map.nodes.map(entry => Math.round((entry.x - 80) / CELL_STEP));
      const rows = map.nodes.map(entry => Math.round((entry.y - 90) / CELL_STEP_Y));
      const col = Math.round((node.x - 80) / CELL_STEP);
      const row = Math.round((node.y - 90) / CELL_STEP_Y);
      if (side === 'left') return col - Math.min(...cols);
      if (side === 'right') return Math.max(...cols) - col;
      if (side === 'top') return row - Math.min(...rows);
      return Math.max(...rows) - row;
    };

    for (const map of maps) {
      for (let order = 1; order <= players; order += 1) {
        const start = numberedCellOf(map, order);
        expect(
          edgeSteps(map, start, SEAT_SIDES[order]),
          `место ${order} стоит на клетке ${start.id}, сторона ${SEAT_SIDES[order]}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it('старт не прилипает к самому краю: крайняя и вторая клетка встречаются одинаково', () => {
    const edgeSteps = (map, node, side) => {
      const cols = map.nodes.map(entry => Math.round((entry.x - 80) / CELL_STEP));
      const rows = map.nodes.map(entry => Math.round((entry.y - 90) / CELL_STEP_Y));
      const col = Math.round((node.x - 80) / CELL_STEP);
      const row = Math.round((node.y - 90) / CELL_STEP_Y);
      if (side === 'left') return col - Math.min(...cols);
      if (side === 'right') return Math.max(...cols) - col;
      if (side === 'top') return row - Math.min(...rows);
      return Math.max(...rows) - row;
    };

    // глубину выбирает сид: на одних партиях старт стоит крайним, на других — вторым от края,
    // но никогда дальше второго
    for (let order = 1; order <= players; order += 1) {
      const depths = maps.map(map => edgeSteps(map, numberedCellOf(map, order), SEAT_SIDES[order]));
      for (const depth of depths) expect(depth).toBeGreaterThanOrEqual(0);
      for (const depth of depths) expect(depth).toBeLessThanOrEqual(1);
      expect(
        new Set(depths).size,
        `место ${order}: глубины ${[...new Set(depths)].join(',')}`,
      ).toBe(2);
    }
  });

  it('у номерной клетки нет соседей из чужой стартовой области: помощника вплотную не поставить', () => {
    // Между номерными клетками остаётся малая земля или своя крупная: сосед номера не может быть
    // клеткой чужой области, иначе чужой помощник встаёт прямо у героя (правило владельца, m00532).
    for (const map of maps) {
      const starts = Array.from({ length: players }, (_, index) => numberedCellOf(map, index + 1));
      const areas = starts.map(start => new Set(areaCellIds(map, start.id)));
      for (const [index, start] of starts.entries()) {
        for (const neighbourId of start.neighbors ?? []) {
          for (const [other, area] of areas.entries()) {
            if (other === index) continue;
            expect(
              area.has(String(neighbourId)),
              `место ${index + 1} на клетке ${start.id}: сосед ${neighbourId} в чужой области места ${other + 1}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('стартовые клетки симметричны, в разных областях и с запасом клеток', () => {
    for (const map of maps) {
      const starts = Array.from({ length: players }, (_, index) => numberedCellOf(map, index + 1));
      expect(starts.every(Boolean)).toBe(true);
      expect(new Set(starts.map(node => node.id)).size).toBe(players);

      const areas = starts.map(start => areaCellIds(map, start.id));
      const areaSets = areas.map(area => new Set(area));
      for (const [index, area] of areas.entries()) {
        // 4 бойца по умолчанию: герой на номерной клетке + три помощника. Чужой герой может стоять
        // на номерной клетке внутри той же области — его клетка в запас не входит.
        const foreign = starts.filter(
          (other, otherIndex) => otherIndex !== index && areaSets[index].has(String(other.id)),
        ).length;
        expect(area.length - foreign).toBeGreaterThanOrEqual(4);
      }

      const xs = starts.map(node => node.x);
      const ys = starts.map(node => node.y);
      if (players === 2) {
        // двое стоят по разные стороны поля, а не через клетку друг от друга
        expect(Math.abs(xs[0] - xs[1])).toBeGreaterThan(CELL_STEP * 2);
      }
    }
  });

  /**
   * Правило владельца: клетки одной стихии стоят **рядом** — стартовая область героя должна быть
   * цельным участком поля, куда встают все его помощники, а не россыпью по всей карте. Поэтому старт
   * берётся только там, где связная область из клеток его стихии вмещает всех бойцов стороны.
   */
  it('стартовая область — цельный участок: связной области хватает на всех бойцов', () => {
    for (const map of maps) {
      for (let order = 1; order <= players; order += 1) {
        const start = numberedCellOf(map, order);
        const connected = terrainAreaCellIds(map.nodes, start.id);
        expect(
          connected.length,
          `место ${order} на клетке ${start.id}: связных клеток ${connected.length}`,
        ).toBeGreaterThanOrEqual(5);

        // связная область вложена в область стихии и содержит саму номерную клетку
        const whole = new Set(areaCellIds(map, start.id));
        expect(connected.every(id => whole.has(id))).toBe(true);
        expect(connected).toContain(String(start.id));
      }
    }
  });

  it('движок принимает сгенерированное поле: расстановка идёт по области героя', () => {
    for (const map of maps.slice(0, 12)) {
      const state = createState({
        phase: PHASES.gameStart,
        map: structuredClone(map),
        players: playersOf(players, map),
      });

      for (const player of state.players) {
        expect(numberedCellId(state, player.id)).not.toBeNull();
        const cells = startAreaCellIds(state, player.id);
        expect(cells.length).toBeGreaterThanOrEqual(player.fighters.length + 1);

        // помощник встаёт в область героя, а клетка чужой области — нет
        const outside = state.map.nodes.find(node => !cells.includes(String(node.id)));
        expect(placementRejection(state, player.id, `${player.id}-pawn`, cells[0])).toBeNull();
        expect(placementRejection(state, player.id, `${player.id}-pawn`, outside.id)).toMatch(
          /одной области/,
        );
      }
    }
  });
});

describe('генератор: партия на сгенерированном поле', () => {
  const create = (testId, testSeed) => {
    createGame(
      {
        mapId: 'generated',
        mode: 'hotseat',
        heroes: [
          { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
          { heroId: 'tesla', team: 'B', order: 2, control: 'human' },
        ],
      },
      { testId, testSeed },
    );
    return load(testId);
  };

  it('createGame собирает партию, а герои встают на номерные клетки своих областей', () => {
    const state = create('gen_a', 21);

    expect(state.map.id).toBe('generated');
    const [minCells, maxCells] = BOARD_PRESETS[2].cells;
    expect(state.map.nodes.length).toBeGreaterThanOrEqual(minCells);
    expect(state.map.nodes.length).toBeLessThanOrEqual(maxCells);

    // Медуза с тремя Гарпиями: в области героя хватает клеток на всех четверых
    expect(startAreaCellIds(state, 'medusa').length).toBeGreaterThanOrEqual(5);
    expect(numberedCellId(state, 'medusa')).not.toBeNull();
    expect(player(state, 'medusa').placementReady).toBe(false);

    // Тесла без помощников: расставлять нечего, подтверждается сама
    expect(player(state, 'tesla').placementReady).toBe(true);
    expect(state.hook).toBe('gameStart');
  });

  it('тот же сид — то же поле', () => {
    const first = create('gen_b', 33);
    const second = create('gen_c', 33);

    expect(JSON.stringify(first.map.nodes)).toBe(JSON.stringify(second.map.nodes));
  });

  /**
   * Правило владельца: номерная клетка **только одноцветная**. По её стихии считается область
   * расстановки, поэтому цветная клетка на стыке зон дала бы игроку сразу две-три области.
   * Проверяем широко — на всех числах игроков и десятках сидов, а не на одном поле.
   */
  it('номерные клетки всегда одноцветные', () => {
    const coloured = [];
    let numbered = 0;

    for (const playerCount of [2, 3, 4]) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const map = generateMap({ players: playerCount, seed, id: 'generated' });
        for (const node of map.nodes ?? []) {
          if (node.heroStart !== true) continue;
          numbered += 1;
          const terrains = Array.isArray(node.terrain) ? node.terrain : [node.terrain];
          if (terrains.filter(Boolean).length !== 1) {
            coloured.push(
              `${playerCount}p seed ${seed}: клетка ${node.id} — ${JSON.stringify(node.terrain)}`,
            );
          }
        }
      }
    }

    expect(numbered).toBeGreaterThan(0);
    expect(coloured).toEqual([]);
  }, 30000);

  /**
   * Клетка на стыке зон принадлежит двум областям, и помощники соседа занимают её первыми: если «своих»
   * (не общих с чужим стартом) клеток меньше пака, игрок остаётся без хода прямо в расстановке.
   * Находка сида 18 на четверых (`bot/tools/hotseat.js`).
   */
  it('у каждого места хватает своих клеток на весь пак', () => {
    const packs = [4, 2, 4, 2];

    for (const playerCount of [2, 3, 4]) {
      for (let seed = 1; seed <= 30; seed += 1) {
        const map = generateMap({
          players: playerCount,
          seed,
          fightersPerPlayer: packs.slice(0, playerCount),
          id: 'generated',
        });
        const areas = [];
        for (let order = 1; order <= playerCount; order += 1) {
          const start = numberedCellOf(map, order);
          areas.push({
            order,
            start: String(start.id),
            cells: new Set(areaCellIds(map, start.id)),
          });
        }

        for (const area of areas) {
          const foreign = new Set(
            areas.filter(other => other.order !== area.order).flatMap(other => [...other.cells]),
          );
          const own = [...area.cells].filter(id => !foreign.has(id)).length;
          expect(
            own,
            `мест ${playerCount}, сид ${seed}, место ${area.order} (клетка ${area.start}): своих клеток ${own}`,
          ).toBeGreaterThanOrEqual(packs[area.order - 1]);
        }
      }
    }
  }, 30000);
});
