#!/usr/bin/env node
/**
 * Аватар бойца из картинки с ровным фоном: вырезать фон, вписать портрет в круг фишки.
 *
 * Исходник приходит JPEG'ом, где «прозрачность» нарисована шахматкой (белое 255 и серое 217) —
 * альфы в таком файле нет. Скрипт заливает от краёв всё светлое нейтральное (шахматку и белое),
 * находит голову (силуэт до сужения в шею), обводит её кругом и добавляет прозрачные поля:
 * аватар на доске рисуется крупнее поля (`TOKEN.avatar` в `useBoardGeometry.js`) и обрезается
 * кругом, поэтому без полей голова не вставала в контур (m01757, m01791). Кадр не режется —
 * вокруг портрета добавляется только прозрачность, исходное изображение остаётся целиком.
 *
 *   node scripts/avatar-from-image.mjs .workbuddy/toto-new.jpg \
 *     server/content/heroes/dorothy/images/avatar-toto.webp
 *
 * `--scale=1.16` — то же `TOKEN.avatar`: какую долю круга занимает картинка на фишке.
 */
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const OUTSIDE_LIGHT = 198; // светлее — фон, а не шерсть
const OUTSIDE_SPREAD = 12; // фон нейтральный: разброс каналов меньше
const SAFETY = 0.92; // запас до контура: голова не должна касаться края круга
const NECK_SHARE = 0.62; // шея уже головы примерно во столько раз
const BOTTOM_SIZE = 512;

const args = process.argv.slice(2);
const paths = args.filter(arg => !arg.startsWith('--'));
const option = name => {
  const found = args.find(arg => arg.startsWith(`--${name}=`));
  return found ? Number(found.split('=')[1]) : undefined;
};

const [sourcePath, outputPath] = paths;
if (!sourcePath || !outputPath) {
  console.error('укажи исходник и выходной webp');
  process.exit(1);
}
const avatarScale = option('scale') ?? 1.16;

const source = await readFile(sourcePath);
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const pixels = Buffer.from(data);
const total = width * height;

const isBackground = key => {
  const index = key << 2;
  const red = pixels[index];
  const green = pixels[index + 1];
  const blue = pixels[index + 2];
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
  const value = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return spread <= OUTSIDE_SPREAD && value >= OUTSIDE_LIGHT;
};

const outside = new Uint8Array(total);
const queue = [];
const seed = key => {
  if (outside[key] || !isBackground(key)) return;
  outside[key] = 1;
  queue.push(key);
};
for (let x = 0; x < width; x += 1) {
  seed(x);
  seed((height - 1) * width + x);
}
for (let y = 0; y < height; y += 1) {
  seed(y * width);
  seed(y * width + width - 1);
}
for (let head = 0; head < queue.length; head += 1) {
  const key = queue[head];
  const x = key % width;
  const y = (key - x) / width;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      seed(ny * width + nx);
    }
  }
}

/** Ряды силуэта: по ним видно, где голова кончается и начинается корпус. */
const rows = [];
let cut = 0;
for (let y = 0; y < height; y += 1) {
  let first = -1;
  let last = -1;
  for (let x = 0; x < width; x += 1) {
    const key = y * width + x;
    if (outside[key]) {
      pixels[(key << 2) + 3] = 0;
      cut += 1;
      continue;
    }
    if (first < 0) first = x;
    last = x;
  }
  if (first >= 0) rows.push({ y, first, last, width: last - first + 1 });
}
if (rows.length === 0) {
  console.error('фон занял всю картинку: фигура не найдена');
  process.exit(1);
}

let widest = 0;
let neck = null;
for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index];
  if (row.width > widest) widest = row.width;
  if (index > 300 && row.width < widest * NECK_SHARE) {
    neck = row.y;
    break;
  }
}
const headRows = rows.filter(row => row.y <= (neck ?? rows[rows.length - 1].y));
const headTop = headRows[0].y;
const headBottom = headRows[headRows.length - 1].y;
let headLeft = width;
let headRight = 0;
for (const row of headRows) {
  if (row.first < headLeft) headLeft = row.first;
  if (row.last > headRight) headRight = row.last;
}
const centerX = (headLeft + headRight) / 2;
const centerY = (headTop + headBottom) / 2;
const headRadius = Math.hypot(headRight - headLeft, headBottom - headTop) / 2;

const visibleShare = 0.5 / avatarScale;
const side = Math.ceil(headRadius / (visibleShare * SAFETY) / 2) * 2;

const cutBuffer = await sharp(pixels, { raw: { width, height, channels: 4 } })
  .png()
  .toBuffer();
const padded = await sharp({
  create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([
    {
      input: cutBuffer,
      left: Math.round(side / 2 - centerX),
      top: Math.round(side / 2 - centerY),
    },
  ])
  .png()
  .toBuffer();

const output = await sharp(padded)
  .resize(BOTTOM_SIZE, BOTTOM_SIZE, { kernel: 'lanczos3' })
  .webp({ quality: 92, effort: 6 })
  .toBuffer();
await writeFile(outputPath, output);

console.log(
  `${outputPath}: вырезано фона — ${cut}, голова ${headRight - headLeft}×${headBottom - headTop} ` +
    `(круг ${Math.round(headRadius)}), полотно ${side} → ${BOTTOM_SIZE}`,
);
