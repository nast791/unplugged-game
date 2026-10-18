import { seatSide } from '#shared/constants/seats.js';
import { isTerrainId, terrainColor, terrainLabelColor } from '#shared/constants/terrain.js';

export const MIN_RADIUS = 24;
export const MAX_RADIUS = 64;

export const nodeRadius = nodeSize => {
  const size = Number(nodeSize) || 72;
  return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, size / 2));
};

export const STROKE = {
  edge: 5,
  edgeColor: '#1E293B',
  cell: 3,
  start: 3,
  highlight: 7,
  divider: 2,
};

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

export const PLACEMENT = {
  free: '#22d3ee',
  busy: '#94a3b8',
  stroke: 3,
  glow: 14,
};

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

export const bendOf = (leftId, rightId) => (stableHash(leftId, rightId) % 2 === 0 ? 1 : -1);

export const bendFor = (from, to) => {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const axisAligned = dx < dy * 0.35 || dy < dx * 0.35;
  if (axisAligned) return 0;
  if (stableHash(from.id ?? from.x, to.id ?? to.x) % 3 === 0) return 0;
  return bendOf(from.id ?? from.x, to.id ?? to.x) * 0.5;
};

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

export const patternSectors = (terrains, radius) => {
  const list = (Array.isArray(terrains) ? terrains : []).filter(Boolean);
  if (!list.length) return [];
  const sectors = sectorWedges(list);
  if (!sectors.length) return [{ terrain: list[0], whole: true, start: 0, end: Math.PI * 2 }];
  return sectors.map(sector => ({
    terrain: sector.terrain,
    whole: false,
    start: (sector.rotation * Math.PI) / 180,
    end: ((sector.rotation + sector.angle) * Math.PI) / 180,
  }));
};

export const sectorClipFunc =
  ({ start, end, radius }) =>
  ctx => {
    ctx.beginPath();
    ctx.arc(0, 0, radius, start, end);
    ctx.lineTo(0, 0);
    ctx.closePath();
  };

export const tileClipFunc = (start, end, radius) =>
  sectorClipFunc({ start, end, radius: radius - STROKE.cell / 2 });

export const PATTERN_TILES = {
  ice: { src: '/patterns/ice-snowflakes.webp', diameter: 1.05, pixels: 1024 },
  lava: { src: '/patterns/lava-veins.webp', diameter: 1.05, pixels: 512 },
  forest: { src: '/patterns/forest-canopy.webp', diameter: 1.05, pixels: 512 },
  desert: { src: '/patterns/desert-sand.webp', diameter: 1.05, pixels: 1024 },
  mountains: { src: '/patterns/mountain-stones.webp', diameter: 1.05, pixels: 512 },
  water: { src: '/patterns/water-marble.webp', diameter: 1.05, pixels: 512 },
  crystal: { src: '/patterns/crystal-shards.webp', diameter: 1.05, pixels: 512 },
  swamp: { src: '/patterns/swamp-moss.webp', diameter: 1.05, pixels: 512 },
  fungus: { src: '/patterns/fungus-spores.webp', diameter: 1.05, pixels: 512 },
  steppe: { src: '/patterns/steppe-grasses.webp', diameter: 1.05, pixels: 512 },
};

export const patternTileConfig = (radius, image, tile) => {
  const side = radius * 2;
  const scale = (side * tile.diameter) / tile.pixels;
  return {
    x: -side / 2,
    y: -side / 2,
    width: side,
    height: side,
    fillPatternImage: image ?? undefined,
    fillPatternRepeat: 'repeat',
    fillPatternScaleX: scale,
    fillPatternScaleY: scale,
    listening: false,
  };
};

export const cellPatterns = (terrains, radius) => {
  if (!(radius > 0)) return [];
  const list = (Array.isArray(terrains) ? terrains : []).filter(Boolean).map(String);
  return patternSectors(list, radius).map(sector => ({
    terrain: sector.terrain,
    start: sector.start,
    end: sector.end,
    clipFunc: sectorClipFunc({ ...sector, radius }),
  }));
};

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

export const SHOW_CELL_IDS = false;

export const nodeLabel = node => ({
  text: String(node?.id ?? ''),
  heroStart: node?.heroStart === true,
  fontSize: 15,
  bold: false,
});

export const nodeLabelColor = node => {
  const raw = node?.terrain;
  const primary = Array.isArray(raw) ? raw[0] : raw;
  return terrainLabelColor(primary);
};

export const nodeLabelConfig = (node, radius) => {
  const label = nodeLabel(node);
  const raw = node?.terrain;
  const primary = Array.isArray(raw) ? raw[0] : raw;
  return {
    text: label.text,
    fontSize: label.fontSize,
    fontStyle: label.bold ? 'bold' : 'normal',
    fill: nodeLabelColor(node),
    stroke: primary ? terrainColor(primary) : undefined,
    strokeWidth: primary ? 3 : 0,
    fillAfterStrokeEnabled: true,
    width: radius * 2,
    align: 'center',
    x: -radius,
    y: -label.fontSize / 2,
    listening: false,
  };
};

export const markerSide = (node, centre) =>
  seatSide(node?.position) ?? markerPlacement(node, centre);

export const markerPlacement = (node, centre) => {
  if (!node || !centre) return 'right';
  const dx = node.x - centre.x;
  const dy = node.y - centre.y;
  if (Math.abs(dx) >= Math.abs(dy) * 1.15) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
};

export const MARKER = {
  sizeFactor: 0.19,
  minSize: 8,
  textFactor: 0.92,
  fill: '#000000',
  text: '#FFFFFF',
  outline: '#FFFFFF',
  outlineWidth: 1.5,
};

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

export const placementOngoing = players =>
  (Array.isArray(players) ? players : []).some(player => player?.placementReady !== true);

export const placementMarkers = (nodes, radius, players) =>
  startMarkers(nodes, radius, { show: placementOngoing(players) });

export const clickTarget = node => {
  let current = node;
  while (current && typeof current.getAttr === 'function') {
    const kind = current.getAttr('cellName');
    if (kind === 'fighter') {
      return {
        kind: 'fighter',
        fighterId: current.getAttr('fighterId'),
        playerId: current.getAttr('ownerId'),
      };
    }
    if (kind === 'cell') return { kind: 'cell', cellId: current.getAttr('cellId') };
    current = typeof current.getParent === 'function' ? current.getParent() : null;
  }
  return null;
};

export const cellAtPoint = (nodes, radius, transform, point) => {
  const scaleX = Number(transform?.scaleX ?? transform?.scale) || 1;
  const scaleY = Number(transform?.scaleY ?? transform?.scale) || 1;
  const x = (Number(point?.x) - Number(transform?.x ?? 0)) / scaleX;
  const y = (Number(point?.y) - Number(transform?.y ?? 0)) / scaleY;

  let found = null;
  let best = Infinity;
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
    const distance = Math.hypot(x - node.x, y - node.y);
    if (!(distance <= radius) || distance >= best) continue;
    best = distance;
    found = String(node.id);
  }
  return found;
};

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
