import { seatSide } from '#shared/constants/seats.js';
import { terrainColor, terrainLabelColor } from '#shared/constants/terrain.js';

/**
 * Геометрия доски: размер кружка, обрезка и изгиб соединителей, сектора цветных клеток,
 * ромбик с номером героя и подписи. Всё чистыми функциями, чтобы это можно было проверить тестами.
 */

export const MIN_RADIUS = 24;
export const MAX_RADIUS = 64;

/** Радиус кружка по размеру клетки из настроек карты. */
export const nodeRadius = nodeSize => {
  const size = Number(nodeSize) || 72;
  return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, size / 2));
};

/** Узор линий и границ: границы у всех клеток одинаковые, номерную клетку отмечает ромбик героя. */
export const STROKE = {
  edge: 5,
  edgeColor: '#1E293B',
  cell: 3,
  start: 3,
  highlight: 7,
  /** Тонкая чёрная полоска между секторами цветной клетки: светлые заливки иначе сливаются. */
  divider: 2,
};

/** Тени: как в оригинале — лёгкая тень и под кружками, и под линиями, от этого доска «стоит». */
export const SHADOW = {
  cell: {
    shadowColor: 'rgba(15, 23, 42, 0.45)',
    shadowBlur: 10,
    shadowOffsetX: 2,
    shadowOffsetY: 5,
    shadowOpacity: 0.9,
  },
  edge: {
    shadowColor: 'rgba(15, 23, 42, 0.35)',
    shadowBlur: 6,
    shadowOffsetX: 1,
    shadowOffsetY: 3,
    shadowOpacity: 0.9,
  },
};

/** Отрезок, обрезанный по кружкам: линия упирается в границы, а не в центры. */
export const trimSegment = (from, to, radius) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  return {
    start: { x: from.x + ux * radius, y: from.y + uy * radius },
    end: { x: to.x - ux * radius, y: to.y - uy * radius },
    length,
    normal: { x: -uy, y: ux },
  };
};

const stableHash = (leftId, rightId) => {
  const key = [String(leftId), String(rightId)].sort().join('-');
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 1000;
  return hash;
};

/** Знак изгиба по паре клеток: одинаковый между вызовами, разный у разных пар. */
export const bendOf = (leftId, rightId) => (stableHash(leftId, rightId) % 2 === 0 ? 1 : -1);

/**
 * Изгиб соединителя. Между ближайшими клетками (линия почти по горизонтали или вертикали)
 * линия прямая — так явно лучше. У диагоналей изгиб плавный и небольшой, и каждая третья
 * диагональ тоже прямая: доска не выглядит ни решёткой, ни щупальцами.
 */
export const bendFor = (from, to) => {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const axisAligned = dx < dy * 0.35 || dy < dx * 0.35;
  if (axisAligned) return 0;
  if (stableHash(from.id ?? from.x, to.id ?? to.x) % 3 === 0) return 0;
  return bendOf(from.id ?? from.x, to.id ?? to.x) * 0.5;
};

/**
 * Точки кривой между двумя кружками. Формат — кубическая кривая для konva `Line` с `bezier: true`;
 * при нулевом изгибе получается ровная линия. Изгиб пологий (не больше 12 px), как на референсах.
 */
export const curvePoints = (from, to, radius, bend = 0) => {
  const { start, end, length, normal } = trimSegment(from, to, radius);
  const amount = bend * Math.min(12, (length || 1) * 0.05);
  const control1 = {
    x: start.x + (end.x - start.x) / 3 + normal.x * amount,
    y: start.y + (end.y - start.y) / 3 + normal.y * amount,
  };
  const control2 = {
    x: start.x + ((end.x - start.x) * 2) / 3 + normal.x * amount,
    y: start.y + ((end.y - start.y) * 2) / 3 + normal.y * amount,
  };
  return [start.x, start.y, control1.x, control1.y, control2.x, control2.y, end.x, end.y];
};

/**
 * Сектора цветной клетки. Два цвета делятся **по вертикали** — левая и правая половины;
 * три цвета — равные сектора «пирогом» (как в оригинале). Углы в градусах: konva `Wedge`
 * рисует от `rotation` на `angle`, отсчёт начинается сверху и идёт по часовой стрелке.
 */
export const sectorWedges = terrains => {
  const list = Array.isArray(terrains) ? terrains.filter(Boolean) : [];
  if (list.length < 2) return [];
  const angle = 360 / list.length;
  return list.map((terrain, index) => ({
    terrain,
    color: terrainColor(terrain),
    rotation: -90 + angle * index,
    angle,
  }));
};

/**
 * Разделители между секторами цветной клетки: тонкая чёрная полоска от центра к краю
 * по каждой границе сектора. Без неё светлые заливки сливаются друг с другом.
 */
export const sectorDividers = (terrains, radius) => {
  const sectors = sectorWedges(terrains);
  if (sectors.length < 2) return [];
  return sectors.map(sector => {
    const angle = (sector.rotation * Math.PI) / 180;
    return {
      points: [0, 0, Math.cos(angle) * radius, Math.sin(angle) * radius],
      stroke: STROKE.edgeColor,
      strokeWidth: STROKE.divider,
      listening: false,
    };
  });
};

/** Подпись внутри клетки — её id, мелко и тихо: на доске важнее стихия и номер героя. */
export const nodeLabel = node => ({
  text: String(node?.id ?? ''),
  heroStart: node?.heroStart === true,
  fontSize: 15,
  bold: false,
});

/** Цвет подписи: у цветной клетки считаем по основной стихии, у обычной — по её стихии. */
export const nodeLabelColor = node => {
  const raw = node?.terrain;
  const primary = Array.isArray(raw) ? raw[0] : raw;
  return terrainLabelColor(primary);
};

/** Параметры подписи для konva: центрируем по ширине кружка. */
export const nodeLabelConfig = (node, radius) => {
  const label = nodeLabel(node);
  return {
    text: label.text,
    fontSize: label.fontSize,
    fontStyle: label.bold ? 'bold' : 'normal',
    fill: nodeLabelColor(node),
    width: radius * 2,
    align: 'center',
    x: -radius,
    y: -label.fontSize / 2,
    listening: false,
  };
};

/**
 * Куда смотрит маркер стартовой клетки. У номерной клетки сторона задана местом игрока (1 — слева,
 * 2 — справа, 3 — сверху, 4 — снизу), поэтому номер всегда стоит с той стороны, где игрок сидит;
 * для клетки без места остаётся запасное правило — наружу от центра поля.
 */
export const markerSide = (node, centre) =>
  seatSide(node?.position) ?? markerPlacement(node, centre);

/**
 * Куда смотрит маркер, если место неизвестно: наружу от центра поля. У стартовой клетки слева маркер
 * уходит влево, сверху — вверх, и так далее, поэтому он не наезжает на id клетки и не теряется.
 */
export const markerPlacement = (node, centre) => {
  if (!node || !centre) return 'right';
  const dx = node.x - centre.x;
  const dy = node.y - centre.y;
  if (Math.abs(dx) >= Math.abs(dy) * 1.15) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
};

/**
 * Маркер стартовой клетки — **маленький чёрный кружок с номером героя на обводке клетки**.
 * Он нужен только на расстановке: игрок видит, какая клетка чья; в остальное время номер героя
 * на доске не нужен, и маркеры не рисуются вовсе (`startMarkers` с `show: false`).
 */
export const MARKER = {
  /** размер кружка от радиуса клетки: маркер компактный, клетку он не закрывает */
  sizeFactor: 0.19,
  minSize: 8,
  /** шрифт цифры от радиуса маркера */
  textFactor: 0.92,
  fill: '#000000',
  text: '#FFFFFF',
  outline: '#FFFFFF',
  outlineWidth: 1.5,
};

/** Маркер в координатах поля (не клетки): кружок и цифра. `null`, если клетка не номерная. */
export const heroMarker = (node, radius, placement = 'right') => {
  const order = Number(node?.position);
  if (node?.heroStart !== true || !Number.isFinite(order) || order <= 0) return null;

  const size = Math.max(MARKER.minSize, Math.round(radius * MARKER.sizeFactor));
  const centre = {
    right: { x: radius, y: 0 },
    left: { x: -radius, y: 0 },
    top: { x: 0, y: -radius },
    bottom: { x: 0, y: radius },
  }[placement] ?? { x: radius, y: 0 };
  const originX = (Number(node?.x) || 0) + centre.x;
  const originY = (Number(node?.y) || 0) + centre.y;
  const fontSize = Math.max(8, Math.round(size * MARKER.textFactor));

  return {
    size,
    disc: {
      x: originX,
      y: originY,
      radius: size,
      fill: MARKER.fill,
      stroke: MARKER.outline,
      strokeWidth: MARKER.outlineWidth,
      listening: false,
    },
    label: {
      x: originX - size,
      y: originY - fontSize / 2,
      width: size * 2,
      align: 'center',
      text: String(order),
      fontSize,
      fontStyle: 'bold',
      fill: MARKER.text,
      listening: false,
    },
  };
};

/** Габариты маркера в координатах поля: кружок вместе с обводкой. */
export const markerBox = (node, radius, placement = 'right') => {
  const marker = heroMarker(node, radius, placement);
  if (!marker) return null;
  const half = marker.size + MARKER.outlineWidth / 2;
  return {
    minX: marker.disc.x - half,
    minY: marker.disc.y - half,
    maxX: marker.disc.x + half,
    maxY: marker.disc.y + half,
  };
};

/**
 * Маркеры стартовых клеток для доски: нужны только на расстановке, поэтому `show: false`
 * (все остальные фазы игры) даёт пустой список — на доске не остаётся ни треугольников, ни кружков.
 * По умолчанию маркеров нет: их надо попросить явно, иначе забытый вызов оставит номера навсегда.
 */
export const startMarkers = (nodes, radius, { show = false } = {}) => {
  if (!show) return [];
  const list = (Array.isArray(nodes) ? nodes : []).filter(
    node => node && Number.isFinite(node.x) && Number.isFinite(node.y),
  );
  if (!list.length) return [];
  const xs = list.map(node => node.x);
  const ys = list.map(node => node.y);
  const centre = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
  return list
    .map(node => {
      const placement = markerSide(node, centre);
      const marker = heroMarker(node, radius, placement);
      return marker ? { id: String(node.id), placement, ...marker } : null;
    })
    .filter(Boolean);
};

/**
 * Идёт ли ещё расстановка: пока хоть кто-то её не подтвердил. У героя без помощников подтверждение
 * автоматическое, поэтому после расстановки человека флаг встаёт и у него — и номера стартовых клеток
 * становятся не нужны. Считаем по флагам игроков, а не по хуку: так кружки исчезают ровно в момент
 * подтверждения, не дожидаясь, пока вью обновит фазу.
 */
export const placementOngoing = players =>
  (Array.isArray(players) ? players : []).some(player => player?.placementReady !== true);

/** Маркеры стартовых клеток на доске: есть, только пока расстановка не закончена у всех. */
export const placementMarkers = (nodes, radius, players) =>
  startMarkers(nodes, radius, { show: placementOngoing(players) });

/**
 * Границы поля: край поля с каждой стороны — **самая крайняя клетка** вместе с её обводкой,
 * никакого лишнего запаса. Единственное, что может выйти за этот край, — маркер стартовой клетки
 * у края: он стоит на обводке и смотрит наружу, иначе цифру бы срезало.
 */
export const fieldBounds = (nodes, radius, { showMarkers = true } = {}) => {
  const list = (Array.isArray(nodes) ? nodes : []).filter(
    node => node && Number.isFinite(node.x) && Number.isFinite(node.y),
  );
  if (!list.length) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };

  const pad = radius + STROKE.highlight / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of list) {
    minX = Math.min(minX, node.x - pad);
    minY = Math.min(minY, node.y - pad);
    maxX = Math.max(maxX, node.x + pad);
    maxY = Math.max(maxY, node.y + pad);
  }

  const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  if (showMarkers) {
    for (const node of list) {
      const box = markerBox(node, radius, markerSide(node, centre));
      if (!box) continue;
      minX = Math.min(minX, box.minX);
      minY = Math.min(minY, box.minY);
      maxX = Math.max(maxX, box.maxX);
      maxY = Math.max(maxY, box.maxY);
    }
  }
  return { minX, minY, maxX, maxY };
};
