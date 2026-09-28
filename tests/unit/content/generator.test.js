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
  MIN_ZONE_CELLS,
  areaCellIds,
  generateMap,
  numberedCellOf,
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
    expect(wide.zoneSizes.length).toBeLessThanOrEqual(8);
    expect(wide.zoneSizes.length).toBeGreaterThanOrEqual(6);
    const narrow = generateMap({ players: 2, seed: 3, zones: 1 });
    expect(narrow.zoneSizes.length).toBeGreaterThanOrEqual(6);
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

  it('на поле есть все шесть стихий, и каждая зона не меньше четырёх клеток', () => {
    for (const map of maps) {
      const used = new Set(map.nodes.flatMap(terrainList));
      expect([...used].sort()).toEqual([...TERRAIN_IDS].sort());
      expect(map.zoneSizes.length).toBeGreaterThanOrEqual(6);
      expect(map.zoneSizes.length).toBeLessThanOrEqual(8);
      for (const size of map.zoneSizes) {
        expect(size).toBeGreaterThanOrEqual(MIN_ZONE_CELLS);
      }
      expect(map.zoneSizes.reduce((sum, size) => sum + size, 0)).toBe(map.nodes.length);
      expect(new Set(map.zoneTerrains).size).toBe(TERRAIN_IDS.length);
    }
  });

  it('у зон нет привилегий: самая большая зона берёт разные стихии на разных сидах', () => {
    const biggest = new Set();
    const seeded = [];
    for (let index = 0; index < 60; index += 1) {
      const map = generateMap({ players: 3, seed: 900 + index });
      biggest.add(map.zoneTerrains[0]);
      seeded.push(map);
    }
    // «фоновой» стихии нет: первая по размеру зона достаётся разным стихиям
    expect(biggest.size).toBeGreaterThan(2);
    // и ни одна стихия не привязана к размеру зоны на всех сидах
    for (const id of TERRAIN_IDS) expect(biggest.has(id), id).toBe(true);
    for (const map of seeded) {
      expect(new Set(map.zoneTerrains).size).toBe(TERRAIN_IDS.length);
    }
  });

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
        expect(degree(node)).toBeLessThanOrEqual(6);
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

  it('стороны разведены: двое — почти через всё поле, остальные — минимум на две клетки', () => {
    const required = players === 2 ? 3.5 : 2;
    for (const map of maps) {
      const starts = Array.from({ length: players }, (_, index) => numberedCellOf(map, index + 1));
      for (let i = 0; i < starts.length; i += 1) {
        for (let j = i + 1; j < starts.length; j += 1) {
          const gap = Math.hypot(starts[i].x - starts[j].x, starts[i].y - starts[j].y);
          expect(gap, `старты ${i + 1} и ${j + 1}`).toBeGreaterThanOrEqual(CELL_STEP * required);
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
  });

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
      expect(Math.max(...degrees)).toBeLessThanOrEqual(6);
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
});
