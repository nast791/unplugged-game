import { describe, expect, it } from 'vitest';
import {
  MARKER,
  MAX_RADIUS,
  MIN_RADIUS,
  SHADOW,
  STROKE,
  bendFor,
  bendOf,
  curvePoints,
  fieldBounds,
  heroMarker,
  markerBox,
  markerPlacement,
  markerSide,
  nodeLabel,
  nodeLabelConfig,
  nodeRadius,
  placementMarkers,
  placementOngoing,
  sectorDividers,
  sectorWedges,
  startMarkers,
  trimSegment,
} from '../../../app/utils/boardGeometry.js';
import { TERRAIN_IDS, colorLuminance, terrainColor } from '#shared/constants/terrain.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('геометрия доски: кружки и границы', () => {
  it('радиус кружка берётся из размера клетки и зажат в разумные границы', () => {
    expect(nodeRadius(96)).toBe(48);
    expect(nodeRadius(1000)).toBe(MAX_RADIUS);
    expect(nodeRadius(4)).toBe(MIN_RADIUS);
    expect(nodeRadius(undefined)).toBe(36);
  });

  it('кружки крупные: диаметр занимает больше половины шага сетки', () => {
    // шаг раскладки 132, размер клетки 96 — соседние кружки почти соприкасаются
    expect(nodeRadius(96) * 2).toBeGreaterThan(132 * 0.7);
  });

  it('границы у всех клеток одинаковые, подсвеченная — самая толстая', () => {
    expect(STROKE.cell).toBeGreaterThanOrEqual(3);
    // у номерных клеток граница такая же, как у остальных: их отмечает ромбик героя
    expect(STROKE.start).toBe(STROKE.cell);
    expect(STROKE.highlight).toBeGreaterThan(STROKE.cell);
    expect(STROKE.edge).toBeGreaterThanOrEqual(5);
  });
});

describe('геометрия доски: палитра яркая и контрастная', () => {
  it('серая стихия в разы светлее остальных', () => {
    expect(colorLuminance(terrainColor('mountains'))).toBeGreaterThan(0.4);
    expect(colorLuminance(terrainColor('mountains'))).toBeGreaterThan(
      colorLuminance(terrainColor('forest')) * 2,
    );
    expect(colorLuminance(terrainColor('mountains'))).toBeGreaterThan(
      colorLuminance(terrainColor('lava')) * 2,
    );
  });

  it('на доске нет тёмных пятен: все заливки достаточно светлые', () => {
    for (const terrain of TERRAIN_IDS) {
      expect(colorLuminance(terrainColor(terrain)), terrain).toBeGreaterThan(0.2);
    }
  });

  it('цвета различаются между собой, а не сливаются', () => {
    const colors = TERRAIN_IDS.map(terrainColor);
    expect(new Set(colors).size).toBe(colors.length);
    const luminances = TERRAIN_IDS.map(id => colorLuminance(terrainColor(id)));
    expect(Math.max(...luminances) - Math.min(...luminances)).toBeGreaterThan(0.3);
  });
});

describe('геометрия доски: соединители', () => {
  it('линия обрезается по границам кружков, а не идёт от центра к центру', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 200, y: 0 };
    const { start, end, length, normal } = trimSegment(from, to, 30);

    expect(distance(from, start)).toBeCloseTo(30, 6);
    expect(distance(to, end)).toBeCloseTo(30, 6);
    expect(length).toBeCloseTo(200, 6);
    expect(normal.x).toBeCloseTo(0, 6);
    expect(Math.abs(normal.y)).toBeCloseTo(1, 6);
  });

  it('между ближайшими клетками линия прямая', () => {
    // соседи по горизонтали и вертикали — расстояние минимальное, тут прямая лучше
    expect(bendFor({ id: 1, x: 0, y: 0 }, { id: 2, x: 132, y: 0 })).toBe(0);
    expect(bendFor({ id: 1, x: 0, y: 0 }, { id: 3, x: 0, y: 132 })).toBe(0);

    const points = curvePoints(
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      30,
      bendFor({ id: 1, x: 0, y: 0 }, { id: 2, x: 200, y: 0 }),
    );
    expect(points[3]).toBeCloseTo(0, 6);
    expect(points[5]).toBeCloseTo(0, 6);
  });

  it('у диагоналей изгиб бывает, но не у всех: линии разные, а не одинаковые щупальца', () => {
    const bends = [];
    for (let left = 1; left <= 12; left += 1) {
      for (let right = 20; right <= 26; right += 1) {
        bends.push(bendFor({ id: left, x: 0, y: 0 }, { id: right, x: 132, y: 132 }));
      }
    }
    expect(bends.some(bend => bend === 0)).toBe(true);
    expect(bends.some(bend => bend !== 0)).toBe(true);
    for (const bend of bends) {
      expect(Math.abs(bend)).toBeLessThanOrEqual(0.8);
    }
  });

  it('кривая остаётся пологой: контрольные точки не улетают далеко', () => {
    const points = curvePoints({ x: 0, y: 0 }, { x: 200, y: 0 }, 30, 0.8);
    expect(points).toHaveLength(8);
    expect(Math.abs(points[3])).toBeLessThan(20);
    expect(Math.abs(points[3])).toBeGreaterThan(4);
  });

  it('знак изгиба зависит от пары клеток и не меняется между вызовами', () => {
    expect(bendOf(3, 7)).toBe(bendOf('3', '7'));
    expect(bendOf(3, 7)).toBe(bendOf(7, 3));
    expect([1, -1]).toContain(bendOf(3, 7));
  });
});

describe('геометрия доски: цветные клетки', () => {
  it('два цвета делятся по вертикали: левая и правая половины', () => {
    const two = sectorWedges(['forest', 'swamp']);
    expect(two.map(sector => sector.angle)).toEqual([180, 180]);
    expect(two.map(sector => sector.rotation)).toEqual([-90, 90]);
    expect(two.map(sector => sector.color)).toEqual([
      terrainColor('forest'),
      terrainColor('swamp'),
    ]);
  });

  it('три цвета — три равных сектора пирогом', () => {
    const three = sectorWedges(['forest', 'swamp', 'lava']);
    expect(three.map(sector => sector.angle)).toEqual([120, 120, 120]);
    expect(three.map(sector => sector.rotation)).toEqual([-90, 30, 150]);
  });

  it('одноцветная клетка секторов не даёт, все стихии валидны', () => {
    expect(sectorWedges(['forest'])).toEqual([]);
    expect(sectorWedges([])).toEqual([]);
    for (const terrain of TERRAIN_IDS) {
      const [sector] = sectorWedges([terrain, 'arcane']);
      expect(sector.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(sector.angle).toBeGreaterThan(0);
    }
  });
});

describe('геометрия доски: подписи и номер героя', () => {
  it('внутри клетки всегда id, а номер героя — отдельным ромбиком на границе', () => {
    expect(nodeLabel({ id: 12 })).toEqual({
      text: '12',
      heroStart: false,
      fontSize: 15,
      bold: false,
    });
    expect(nodeLabel({ id: 12, heroStart: true, position: 2 })).toEqual({
      text: '12',
      heroStart: true,
      fontSize: 15,
      bold: false,
    });
  });

  it('маркер стартовой клетки смотрит наружу от центра поля', () => {
    const centre = { x: 0, y: 0 };
    expect(markerPlacement({ x: -300, y: 0 }, centre)).toBe('left');
    expect(markerPlacement({ x: 300, y: 10 }, centre)).toBe('right');
    expect(markerPlacement({ x: 0, y: -300 }, centre)).toBe('top');
    expect(markerPlacement({ x: 20, y: 300 }, centre)).toBe('bottom');
    // под углом выбирается более выраженная сторона
    expect(markerPlacement({ x: -260, y: -60 }, centre)).toBe('left');
    expect(markerPlacement({ x: -60, y: -260 }, centre)).toBe('top');
  });

  it('маркер смотрит на сторону места: 1 — слева, 2 — справа, 3 — сверху, 4 — снизу', () => {
    // сторона берётся из места игрока, а не из геометрии: даже в углу поля место 1 смотрит влево
    const corner = { id: 1, x: 0, y: 0, heroStart: true, position: 1 };
    const centre = { x: 200, y: 200 };
    expect(markerSide(corner, centre)).toBe('left');
    expect(markerSide({ ...corner, position: 2 }, centre)).toBe('right');
    expect(markerSide({ ...corner, position: 3 }, centre)).toBe('top');
    expect(markerSide({ ...corner, position: 4 }, centre)).toBe('bottom');
    // у клетки без места остаётся запасное правило — наружу от центра поля
    expect(markerSide({ id: 2, x: 0, y: 100 }, centre)).toBe('left');
    expect(markerSide({ id: 3, x: 100, y: 0, heroStart: true }, centre)).toBe('top');
    // и доска ставит маркер именно по этому правилу
    expect(startMarkers([corner], 50, { show: true })[0].placement).toBe('left');
    expect(startMarkers([{ ...corner, position: 4 }], 50, { show: true })[0].placement).toBe(
      'bottom',
    );
  });

  it('маркер стартовой клетки — маленький кружок с номером на обводке', () => {
    const radius = 56;
    const node = { id: 6, x: 200, y: 100, heroStart: true, position: 2 };
    const marker = heroMarker(node, radius, 'right');

    expect(marker).not.toBeNull();
    expect(marker.disc.listening).toBe(false);
    expect(marker.label.text).toBe('2');
    // круг, а не треугольник с полосами: тела-треугольника у маркера больше нет
    expect(marker.disc.radius).toBe(
      Math.max(MARKER.minSize, Math.round(radius * MARKER.sizeFactor)),
    );
    expect(marker.disc.radius).toBeLessThan(radius * 0.5);
    expect(marker.disc.fill).toBe('#000000');
    expect(marker.disc.stroke).toBe('#FFFFFF');
    expect(marker.disc.strokeWidth).toBe(MARKER.outlineWidth);
    expect(marker.stripes).toBeUndefined();
    expect(marker.shape).toBeUndefined();

    // центр кружка лежит на обводке клетки: справа, слева, сверху или снизу
    const placements = {
      right: [radius, 0],
      left: [-radius, 0],
      top: [0, -radius],
      bottom: [0, radius],
    };
    for (const [side, [x, y]] of Object.entries(placements)) {
      const sideMarker = heroMarker(node, radius, side);
      expect([sideMarker.disc.x, sideMarker.disc.y]).toEqual([node.x + x, node.y + y]);
    }

    // цифра стоит по центру кружка и влезает в него
    const labelCentreX = marker.label.x + marker.label.width / 2;
    const labelCentreY = marker.label.y + marker.label.fontSize / 2;
    expect(labelCentreX).toBeCloseTo(marker.disc.x, 6);
    expect(labelCentreY).toBeCloseTo(marker.disc.y, 1);
    expect(marker.label.align).toBe('center');
    expect(marker.label.fontStyle).toBe('bold');
    expect(marker.label.fontSize).toBeLessThan(marker.disc.radius * 2);
    expect(marker.label.listening).toBe(false);
  });

  it('маркер масштабируется вместе с клеткой, но не вырождается в точку', () => {
    const big = heroMarker({ id: 1, x: 0, y: 0, heroStart: true, position: 1 }, 64);
    const small = heroMarker({ id: 2, x: 0, y: 0, heroStart: true, position: 3 }, 24);
    expect(big.disc.radius).toBeGreaterThan(small.disc.radius);
    expect(small.disc.radius).toBe(MARKER.minSize);
    expect(small.label.fontSize).toBeGreaterThanOrEqual(8);
    // у обычной клетки и у номерной без порядка маркера нет
    expect(heroMarker({ id: 3, x: 0, y: 0 }, 48)).toBeNull();
    expect(heroMarker({ id: 4, x: 0, y: 0, heroStart: true }, 48)).toBeNull();
  });

  it('маркеры стартовых клеток есть только на расстановке', () => {
    const nodes = [
      { id: 1, x: 0, y: 0, heroStart: true, position: 1 },
      { id: 2, x: 400, y: 0, heroStart: true, position: 2 },
      { id: 3, x: 200, y: 150 },
    ];
    const during = startMarkers(nodes, 50, { show: true });
    expect(during).toHaveLength(2);
    expect(during.map(marker => marker.label.text)).toEqual(['1', '2']);
    expect(during[0].placement).toBe('left');
    expect(during[1].placement).toBe('right');
    // после расстановки на доске не остаётся ни кружков, ни треугольников
    expect(startMarkers(nodes, 50, { show: false })).toEqual([]);
    expect(startMarkers([], 50, { show: true })).toEqual([]);
    expect(startMarkers(null, 50, { show: true })).toEqual([]);
    // по умолчанию маркеров нет: забытый вызов не оставит номера на доске
    expect(startMarkers(nodes, 50)).toEqual([]);
  });

  it('номера стартовых клеток исчезают, как только расстановку подтвердили все', () => {
    const nodes = [
      { id: 1, x: 0, y: 0, heroStart: true, position: 1 },
      { id: 2, x: 400, y: 0, heroStart: true, position: 2 },
    ];
    const medusa = { id: 'medusa', placementReady: false };
    const tesla = { id: 'tesla', placementReady: true };
    const ai = { id: 'ai', placementReady: false };

    // герой без помощников подтверждается сам, но пока второй игрок расставляет — номера нужны
    expect(placementOngoing([medusa, tesla])).toBe(true);
    expect(placementMarkers(nodes, 50, [medusa, tesla])).toHaveLength(2);

    // человек подтвердил — маркеров нет, хотя фаза во вью могла ещё не обновиться
    const done = [{ ...medusa, placementReady: true }, tesla];
    expect(placementOngoing(done)).toBe(false);
    expect(placementMarkers(nodes, 50, done)).toEqual([]);

    // все подтверждены автоматически — тоже ничего
    expect(placementMarkers(nodes, 50, [tesla, { ...ai, placementReady: true }])).toEqual([]);
    // пустой список игроков (доска без данных) номеров не рисует
    expect(placementMarkers(nodes, 50, [])).toEqual([]);
    expect(placementMarkers(nodes, 50, null)).toEqual([]);
  });

  it('габариты маркера — кружок вместе с обводкой', () => {
    const radius = 60;
    const node = { id: 7, x: 100, y: 200, heroStart: true, position: 1 };
    const right = markerBox(node, radius, 'right');
    const size = Math.max(MARKER.minSize, Math.round(radius * MARKER.sizeFactor));
    const half = size + MARKER.outlineWidth / 2;
    expect(right).not.toBeNull();
    expect(right.minX).toBeCloseTo(node.x + radius - half, 6);
    expect(right.maxX).toBeCloseTo(node.x + radius + half, 6);
    expect(right.minY).toBeCloseTo(node.y - half, 6);
    expect(right.maxY).toBeCloseTo(node.y + half, 6);
    // у обычной клетки габаритов маркера нет
    expect(markerBox({ id: 8, x: 0, y: 0 }, radius, 'right')).toBeNull();
    // маркер слева уходит влево, сверху — вверх
    const left = markerBox(node, radius, 'left');
    expect(left.minX).toBeLessThan(node.x - radius);
    const top = markerBox(node, radius, 'top');
    expect(top.minY).toBeLessThan(node.y - radius);
  });

  it('край поля — самая крайняя клетка с каждой стороны', () => {
    const radius = 50;
    const nodes = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 400, y: 200 },
      { id: 3, x: 170, y: 100 },
    ];
    const bounds = fieldBounds(nodes, radius);
    const pad = radius + STROKE.highlight / 2;
    expect(bounds.minX).toBeCloseTo(-pad, 6);
    expect(bounds.maxX).toBeCloseTo(400 + pad, 6);
    expect(bounds.minY).toBeCloseTo(-pad, 6);
    expect(bounds.maxY).toBeCloseTo(200 + pad, 6);
    // лишнего запаса нет: край поля проходит по обводке крайнего кружка
    expect(bounds.minX + STROKE.highlight / 2).toBeCloseTo(-radius, 6);
    expect(bounds.maxY - STROKE.highlight / 2).toBeCloseTo(200 + radius, 6);
  });

  it('маркер стартовой клетки у края не срезается краем поля', () => {
    const radius = 50;
    const nodes = [
      { id: 1, x: 0, y: 0, heroStart: true, position: 1 },
      { id: 2, x: 400, y: 0 },
    ];
    const bounds = fieldBounds(nodes, radius);
    const box = markerBox(nodes[0], radius, 'left');
    expect(box.minX).toBeLessThan(-radius);
    expect(bounds.minX).toBeCloseTo(box.minX, 6);
    // остальные направления остаются по клетке
    expect(bounds.minY).toBeCloseTo(-radius - STROKE.highlight / 2, 6);
    expect(bounds.maxX).toBeCloseTo(400 + radius + STROKE.highlight / 2, 6);
    // без маркеров (после расстановки) поле обрезано строго по крайним клеткам
    const withoutMarkers = fieldBounds(nodes, radius, { showMarkers: false });
    expect(withoutMarkers.minX).toBeCloseTo(-radius - STROKE.highlight / 2, 6);
  });

  it('у пустого поля остаются запасные границы', () => {
    expect(fieldBounds([], 50)).toEqual({ minX: 0, minY: 0, maxX: 400, maxY: 300 });
    expect(fieldBounds(null, 50)).toEqual({ minX: 0, minY: 0, maxX: 400, maxY: 300 });
  });

  it('между секторами цветной клетки есть тонкие чёрные разделители', () => {
    const dividers = sectorDividers(['arcane', 'desert'], 52);
    expect(dividers).toHaveLength(2);
    for (const divider of dividers) {
      expect(divider.stroke).toBe(STROKE.edgeColor);
      expect(divider.strokeWidth).toBe(STROKE.divider);
      expect(divider.strokeWidth).toBeLessThan(STROKE.edge);
      // линия идёт из центра к краю кружка
      const [x0, y0, x1, y1] = divider.points;
      expect([x0, y0]).toEqual([0, 0]);
      expect(Math.hypot(x1, y1)).toBeCloseTo(52, 6);
    }
    // два цвета — вертикальный диаметр: верх и низ
    expect(dividers.map(divider => Math.round(divider.points[3]))).toEqual([-52, 52]);
    expect(sectorDividers(['forest', 'swamp', 'lava'], 52)).toHaveLength(3);
    expect(sectorDividers(['forest'], 52)).toEqual([]);
  });

  it('подпись центрируется по кружку и не перехватывает клики', () => {
    // у клетки всегда есть стихия: заливку и цвет подписи берём из неё, запасной стихии нет
    const config = nodeLabelConfig({ id: 5, terrain: 'arcane' }, 48);
    expect(config.width).toBe(96);
    expect(config.x).toBe(-48);
    expect(config.align).toBe('center');
    expect(config.listening).toBe(false);
    // клетка без стихии — ошибка контента, а не «нарисовать как-нибудь»
    expect(() => nodeLabelConfig({ id: 5 }, 48)).toThrow(/Неизвестная стихия/);
  });

  it('подпись всегда контрастнее: выбирается лучший из двух цветов', () => {
    const contrast = (left, right) => {
      const [light, dark] = [left, right].sort((a, b) => b - a);
      return (light + 0.05) / (dark + 0.05);
    };
    for (const terrain of TERRAIN_IDS) {
      const luminance = colorLuminance(terrainColor(terrain));
      const chosen = nodeLabelConfig({ id: 1, terrain }, 48).fill;
      const other = chosen === '#F8FAFC' ? '#111827' : '#F8FAFC';
      expect(contrast(luminance, chosen === '#F8FAFC' ? 1 : 0), terrain).toBeGreaterThanOrEqual(
        contrast(luminance, other === '#F8FAFC' ? 1 : 0),
      );
      expect(['#F8FAFC', '#111827']).toContain(chosen);
    }
  });
});

describe('геометрия доски: тени', () => {
  it('тени есть и у клеток, и у соединителей', () => {
    for (const shadow of [SHADOW.cell, SHADOW.edge]) {
      expect(shadow.shadowColor).toMatch(/rgba?\(/);
      expect(shadow.shadowBlur).toBeGreaterThan(0);
      expect(Math.abs(shadow.shadowOffsetY)).toBeGreaterThan(0);
    }
  });
});
