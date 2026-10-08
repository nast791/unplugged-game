import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

/**
 * Разбор SVG-референсов: достаём отдельные фигуры (path) из файла и рисуем контактный лист,
 * чтобы выбрать мотивы для текстур клеток. Это инструмент разработки, в игру он не идёт.
 *
 * Запуск: node tests/support/svg-motifs.mjs <файл> [сколько фигур] [отступ]
 */

const [, , file, limitArg, offsetArg] = process.argv;
if (!file) {
  console.error('укажи файл: node tests/support/svg-motifs.mjs .refs/patterns/foo.svg 48 0');
  process.exit(1);
}
const limit = Number(limitArg) || 48;
const offset = Number(offsetArg) || 0;

const source = readFileSync(file, 'utf8');
const head = source.slice(0, 4000);
const viewBox = (head.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 1000 1000').split(/\s+/).map(Number);
const [, , boxWidth, boxHeight] = viewBox;

/** Ищем фигуры в порядке документа и запоминаем накопленные трансформации групп. */
const shapes = [];
const stack = [];
const tagPattern = /<(\/?)(g|path)\b([^>]*)>/g;
let match;
while ((match = tagPattern.exec(source))) {
  const [, closing, tag, attrs] = match;
  if (tag === 'g') {
    if (closing) stack.pop();
    else stack.push(attrs.match(/transform="([^"]+)"/)?.[1] ?? '');
    continue;
  }
  const transform = stack.filter(Boolean).join(' ');
  const d = attrs.match(/\sd="([^"]+)"/)?.[1];
  if (d) shapes.push({ d, transform, fill: attrs.match(/fill="([^"]+)"/)?.[1] ?? null });
}

console.log(`${file}: фигур ${shapes.length}, viewBox ${boxWidth}×${boxHeight}`);

const picked = shapes.slice(offset, offset + limit);
const columns = 8;
const tile = 120;
const rows = Math.ceil(picked.length / columns);
const sheet = sharp({
  create: {
    width: columns * tile,
    height: rows * tile,
    channels: 3,
    background: { r: 255, g: 255, b: 255 },
  },
});

const composites = [];
for (const [index, shape] of picked.entries()) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="${viewBox.join(' ')}" preserveAspectRatio="xMidYMid meet">
<rect x="0" y="0" width="${boxWidth}" height="${boxHeight}" fill="white"/>
<g transform="${shape.transform ?? ''}"><path d="${shape.d}" fill="#1f2937" stroke="none"/></g>
</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  composites.push({
    input: png,
    left: (index % columns) * tile,
    top: Math.floor(index / columns) * tile,
  });
}

mkdirSync('.refs/patterns/_sheets', { recursive: true });
const name = file
  .split('/')
  .pop()
  .replace(/\.svg$/, '');
const output = `.refs/patterns/_sheets/${name}-${offset}.png`;
await sheet.composite(composites).png().toFile(output);
console.log(`лист: ${output} (${picked.length} фигур, порядок слева направо, сверху вниз)`);
