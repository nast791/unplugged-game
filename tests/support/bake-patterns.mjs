import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Запекание **векторной** текстуры стихии: сейчас это только лёд — сеть прожилок, нарисованная
 * своей геометрией (не из референса). Остальные стихии рисуются растровыми плитками, их собирает
 * `tests/support/bake-tiles.mjs`.
 *
 * Запуск: node tests/support/bake-patterns.mjs
 * Инструмент разработки: в сборку не входит, нужен только для пересборки текстур.
 */

const BAKE = 100; // эталонный радиус клетки: в этих единицах записываем пути
const OUT = 'app/utils/patternTextures.js';

const round = value => Math.round(value * 100) / 100;

/** Детерминированный шум: одна и та же картинка при каждой пересборке. */
const noise2 = (a, b) => {
  const value = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

/** Трещина: ломаная с ответвлениями. */
const crackPath = (x, y, angle, length, depth, seed) => {
  const parts = [];
  const points = [[x, y]];
  let heading = angle;
  let current = [x, y];
  const segments = 4 + Math.floor(noise2(x + seed, y) * 3);
  for (let step = 0; step < segments; step += 1) {
    heading += (noise2(current[0] * 10 + step, current[1] * 10 + seed) - 0.5) * 1.2;
    const size = (length / segments) * (0.6 + noise2(step, seed) * 0.8);
    current = [current[0] + Math.cos(heading) * size, current[1] + Math.sin(heading) * size];
    points.push(current);
    if (depth > 0 && noise2(current[1] * 10 + seed, current[0] * 10) > 0.62) {
      parts.push(
        crackPath(
          current[0],
          current[1],
          heading + (noise2(current[0], current[1] + seed) > 0.5 ? 1 : -1),
          length * 0.5,
          depth - 1,
          seed + 7,
        ),
      );
    }
  }
  const commands = [`M ${round(points[0][0] * BAKE)} ${round(points[0][1] * BAKE)}`];
  for (const [px, py] of points.slice(1)) {
    commands.push(`L ${round(px * BAKE)} ${round(py * BAKE)}`);
  }
  return [...parts, commands.join(' ')].join(' ');
};

/** Сеть трещин по всей клетке: затравочные точки по решётке, направления разные. */
const crackNet = (count, length, seedBase) => {
  const parts = [];
  const side = Math.ceil(Math.sqrt(count));
  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      const index = row * side + column;
      if (index >= count) break;
      const x = -0.95 + (1.9 * (column + 0.5)) / side + (noise2(index, seedBase) - 0.5) * 0.3;
      const y = -0.95 + (1.9 * (row + 0.5)) / side + (noise2(seedBase, index) - 0.5) * 0.3;
      parts.push(crackPath(x, y, noise2(x * 7, y * 5) * Math.PI * 2, length, 2, seedBase + index));
    }
  }
  return parts.join(' ');
};

const textures = {
  // лёд: две сети тонких прожилок, вторая мельче и светлее
  frost: {
    layers: [
      { mode: 'stroke', width: 1.3, opacity: 0.42, d: crackNet(8, 1.3, 0.4) },
      { mode: 'stroke', width: 1, opacity: 0.26, d: crackNet(12, 0.8, 2.7) },
    ],
  },
};

/** Габариты слоёв в радиусах клетки: по ним видно, что текстура доходит до края. */
const extentOf = texture => {
  let peak = 0;
  for (const layer of texture.layers) {
    for (const token of layer.d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []) {
      const value = Math.abs(Number(token));
      if (value > peak) peak = value;
    }
  }
  return { x: peak / BAKE, y: peak / BAKE };
};

const header = `/**
 * Векторная текстура стихии — лёд: сеть прожилок, нарисованная своей геометрией
 * (**1 = радиус клетки**, центр клетки в нуле). Остальные стихии рисуются растровыми плитками,
 * их собирает \`tests/support/bake-tiles.mjs\`.
 *
 * Пересобрать: node tests/support/bake-patterns.mjs.
 * Руками этот файл не правят: правки затрутся при следующей пересборке.
 */

/** Эталонный радиус: пути записаны в этих единицах, на доске их масштабирует сам узел. */
export const PATTERN_BAKE_RADIUS = ${BAKE};

/** Текстуры по id стихии: слои с прозрачностью и режимом (заливка или штрих). */
export const PATTERN_TEXTURES = {
`;

const body = Object.entries(textures)
  .map(([terrain, texture]) => {
    const layers = texture.layers
      .map(
        layer =>
          `    { mode: '${layer.mode}', opacity: ${layer.opacity},${layer.width ? ` width: ${layer.width},` : ''} d: '${layer.d}' },`,
      )
      .join('\n');
    return `  ${terrain}: [\n${layers}\n  ],`;
  })
  .join('\n');

const extents = Object.entries(textures)
  .map(([terrain, texture]) => {
    const extent = extentOf(texture);
    return `  ${terrain}: { x: ${extent.x.toFixed(2)}, y: ${extent.y.toFixed(2)} },`;
  })
  .join('\n');

const footer = `};

/** Габариты текстур в радиусах клетки: по ним видно, что текстура доходит до края. */
export const PATTERN_TEXTURE_EXTENT = {
${extents}
};
`;

mkdirSync('app/utils', { recursive: true });
writeFileSync(OUT, `${header}${body}${footer}`, 'utf8');
for (const [terrain, texture] of Object.entries(textures)) {
  const size = texture.layers.reduce((sum, layer) => sum + layer.d.length, 0);
  console.log(`${terrain}: слоёв ${texture.layers.length}, путей ${(size / 1024).toFixed(1)} КБ`);
}
console.log(`текстуры: ${OUT}`);
