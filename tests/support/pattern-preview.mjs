import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { PATTERN_TILES, cellPatterns, nodeRadius } from '../../app/utils/boardGeometry.js';
import { TERRAIN_IDS, terrainColor, terrainName } from '#shared/constants/terrain.js';

/**
 * Превью узоров стихий: те же пути, что рисует доска, только средствами SVG — чтобы смотреть
 * на свою работу глазами, а не догадываться. PNG кладётся в системный temp, проект не мусорим.
 *
 * Запуск: `node tests/support/pattern-preview.mjs` (нужен `sharp` из зависимостей Nuxt).
 */
const OUTPUT = process.env.PREVIEW_OUTPUT ?? join(tmpdir(), 'unplugged-patterns-preview.png');
// PREVIEW_ZOOM=2 — крупный вариант: удобно разглядывать детали текстур
const ZOOM = Number(process.env.PREVIEW_ZOOM) || 1;
const CELL = 132 * ZOOM;
// на доске радиус зажат nodeRadius (не больше 64); для разглядывания деталей берём его без зажима
const RADIUS = ZOOM > 1 ? CELL / 2 : nodeRadius(CELL);
const BOX = 170 * ZOOM;
const COLUMNS = 4;
const CELLS = [
  ...TERRAIN_IDS.map(terrain => ({ label: terrainName(terrain), terrains: [terrain] })),
  { label: 'лес + вода', terrains: ['forest', 'water'] },
  { label: 'лес + вода + лава', terrains: ['forest', 'water', 'lava'] },
];

/**
 * Растровые плитки стихий в base64: превью показывает то же, что и доска. Плитки лежат в WebP,
 * а просмотрщик SVG внутри sharp читает его не всегда — поэтому переводим во встроенный PNG.
 */
const TILE_DATA = Object.fromEntries(
  await Promise.all(
    Object.entries(PATTERN_TILES).map(async ([terrain, tile]) => [
      terrain,
      `data:image/png;base64,${(await sharp(`public${tile.src}`).png().toBuffer()).toString('base64')}`,
    ]),
  ),
);

/** Кусок пирога сектора — для заливки и для обрезки узора. */
const sectorPath = (start, end, radius) => {
  const x1 = Math.cos(start) * radius;
  const y1 = Math.sin(start) * radius;
  const x2 = Math.cos(end) * radius;
  const y2 = Math.sin(end) * radius;
  const large = end - start > Math.PI ? 1 : 0;
  return `M 0 0 L ${round(x1)} ${round(y1)} A ${radius} ${radius} 0 ${large} 1 ${round(x2)} ${round(y2)} Z`;
};

const round = value => Math.round(value * 100) / 100;

const cellSvg = (terrains, cx, cy) => {
  const patterns = cellPatterns(terrains, RADIUS);
  const sectors = terrains.length > 1 ? terrains.length : 0;
  const step = 360 / (sectors || 1);
  const parts = [
    `<circle cx="${cx}" cy="${cy}" r="${RADIUS}" fill="${terrainColor(terrains[0])}" stroke="#1E293B" stroke-width="3"/>`,
  ];

  terrains.slice(1).forEach((terrain, index) => {
    const start = ((-90 + step * (index + 1)) * Math.PI) / 180;
    const end = ((-90 + step * (index + 2)) * Math.PI) / 180;
    parts.push(
      `<path d="${sectorPath(start, end, RADIUS)}" fill="${terrainColor(terrain)}" transform="translate(${cx} ${cy})"/>`,
    );
  });

  patterns.forEach((pattern, index) => {
    const clipId = `clip-${cx}-${cy}-${index}`;
    const start = ((-90 + step * index) * Math.PI) / 180;
    const end = ((-90 + step * (index + 1)) * Math.PI) / 180;
    const clip = sectors
      ? sectorPath(start, end, RADIUS * 1.02)
      : `M ${-RADIUS} 0 A ${RADIUS} ${RADIUS} 0 1 1 ${RADIUS} 0 A ${RADIUS} ${RADIUS} 0 1 1 ${-RADIUS} 0 Z`;
    const tile = TILE_DATA[pattern.terrain];
    const side = RADIUS * 2 * (PATTERN_TILES[pattern.terrain]?.diameter ?? 1);
    // как на доске: если у стихии есть растровая плитка, векторные слои под ней не рисуются
    const inside = tile
      ? `<image xlink:href="${tile}" x="${cx - side / 2}" y="${cy - side / 2}" width="${side}" height="${side}" preserveAspectRatio="xMidYMid slice"/>`
      : pattern.layers
          .map(
            layer =>
              `<path d="${layer.data}" fill="${layer.fill ?? 'none'}" stroke="${layer.stroke ?? 'none'}" stroke-width="${layer.strokeWidth ?? 0}" fill-opacity="${layer.fill ? layer.opacity : 0}" stroke-opacity="${layer.stroke ? layer.opacity : 0}" stroke-linejoin="round" stroke-linecap="round" transform="translate(${cx} ${cy}) scale(${layer.scaleX ?? 1})"/>`,
          )
          .join('');
    parts.push(
      `<clipPath id="${clipId}"><path d="${clip}" transform="translate(${cx} ${cy})"/></clipPath>`,
      `<g clip-path="url(#${clipId})">${inside}</g>`,
    );
  });

  for (let index = 0; index < sectors; index += 1) {
    const rad = ((-90 + step * index) * Math.PI) / 180;
    parts.push(
      `<line x1="${cx}" y1="${cy}" x2="${round(cx + Math.cos(rad) * RADIUS)}" y2="${round(cy + Math.sin(rad) * RADIUS)}" stroke="#1E293B" stroke-width="2"/>`,
    );
  }

  // номер клетки: тот же ободок цветом заливки, что и на доске
  parts.push(
    `<text x="${cx}" y="${cy + 5}" font-family="Arial" font-size="15" text-anchor="middle" fill="#111827" stroke="${terrainColor(terrains[0])}" stroke-width="3" paint-order="stroke">12</text>`,
  );
  return parts.join('\n');
};

const rows = Math.ceil(CELLS.length / COLUMNS);
const width = COLUMNS * BOX;
const height = rows * BOX + 30;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#eef1f4"/>
${CELLS.map((cell, index) => {
  const cx = (index % COLUMNS) * BOX + BOX / 2;
  const cy = Math.floor(index / COLUMNS) * BOX + BOX / 2 + 10;
  return `${cellSvg(cell.terrains, cx, cy)}\n<text x="${cx}" y="${cy + 84}" font-family="Arial" font-size="13" text-anchor="middle" fill="#334155">${cell.label}</text>`;
}).join('\n')}
</svg>`;

mkdirSync(dirname(OUTPUT), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(OUTPUT);
console.log(`превью узоров: ${OUTPUT}`);
