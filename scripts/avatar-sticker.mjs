#!/usr/bin/env node
/**
 * Аватар из картинки с ровным фоном: вырезать фон и вписать портрет в круг фишки ровно,
 * без зазора между кругом аватара и полем портрета.
 *
 * Исходник приходит JPEG'ом, где «прозрачность» нарисована шахматкой (белое 255, серое 175–190):
 * альфы в файле нет. Скрипт заливает от краёв всё светлое нейтральное, потом гасит шахматку по
 * решётке (у неё через клетку меняется тон) и карманы, зажатые между волосками, и режет картинку
 * по кругу самой шахматки — это и есть круг аватара. На доске картинка рисуется по размеру поля
 * портрета (`TOKEN.avatar` = 1), поэтому её круг совпадает с полем: зазора нет, детали силуэта
 * не срезаются.
 *
 *   node scripts/avatar-sticker.mjs .workbuddy/dorothy-new.jpg \
 *     server/content/heroes/dorothy/images/avatar-dorothy.webp
 *
 * `--margin=0` — сколько долей радиуса оставить полем вокруг круга. Шахматка во весь кадр
 * (фон без круга) — значит круг считается по силуэту.
 */
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const LIGHT = 150; // светлее и нейтральнее — фон (шахматка), а не портрет
const SPREAD = 10;
const CHECKER_LIGHT = 200; // шахматка: серые клетки ~219, белые 255
const CHECKER_DARK = 244;
const CHECKER_SPREAD = 8;
const FRINGE_VALUE = 200; // остатки шахматки у волос тоже светлые и нейтральные
const FRINGE_SPREAD = 20;
const FRINGE_PASSES = 80;
const FULL_SHARE = 0.92; // шахматка больше этой доли картинки — значит фон во весь кадр, не круг
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
const margin = option('margin') ?? 0;

const { data, info } = await sharp(await readFile(sourcePath))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height } = info;
const pixels = Buffer.from(data);
const total = width * height;

const channels = key => {
  const index = key << 2;
  const red = pixels[index];
  const green = pixels[index + 1];
  const blue = pixels[index + 2];
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
  const value = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return { spread, value };
};

const isBackground = key => {
  const { spread, value } = channels(key);
  return spread <= SPREAD && value >= LIGHT;
};
const isChecker = key => {
  const { spread, value } = channels(key);
  return spread <= CHECKER_SPREAD && value >= CHECKER_LIGHT && value <= CHECKER_DARK;
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
let checkerLeft = width;
let checkerRight = -1;
let checkerTop = height;
let checkerBottom = -1;
for (let head = 0; head < queue.length; head += 1) {
  const key = queue[head];
  if (isChecker(key)) {
    const x = key % width;
    const y = (key - x) / width;
    if (x < checkerLeft) checkerLeft = x;
    if (x > checkerRight) checkerRight = x;
    if (y < checkerTop) checkerTop = y;
    if (y > checkerBottom) checkerBottom = y;
  }
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

const transparent = new Uint8Array(total);
for (let key = 0; key < total; key += 1) {
  if (outside[key]) transparent[key] = 1;
}
for (let pass = 0; pass < FRINGE_PASSES; pass += 1) {
  const grown = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = y * width + x;
      if (transparent[key]) continue;
      const { spread, value } = channels(key);
      if (spread > FRINGE_SPREAD || value < FRINGE_VALUE) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (transparent[ny * width + nx]) {
            touches = true;
            break;
          }
        }
      }
      if (touches) grown.push(key);
    }
  }
  if (grown.length === 0) break;
  for (const key of grown) transparent[key] = 1;
}

/** Шахматка — решётка: через клетку тон меняется. Шаг решётки ищем по контрасту, потом гасим её. */
let period = 0;
let bestScore = 0;
for (let step = 14; step <= 24; step += 2) {
  let score = 0;
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x + step < width; x += 3) {
      const key = y * width + x;
      if (transparent[key]) continue;
      const own = channels(key);
      if (own.spread > 14 || own.value < 168) continue;
      const next = channels(key + step);
      if (next.spread > 16 || next.value < 168) continue;
      if (Math.abs(own.value - next.value) >= 14) score += 1;
    }
  }
  if (score > bestScore) {
    bestScore = score;
    period = step;
  }
}
const protectedKey = key => {
  const x = key % width;
  const y = (key - x) / width;
  return x > width * 0.32 && x < width * 0.68 && y > height * 0.28 && y < height * 0.75;
};
if (period > 0 && bestScore > total * 0.002) {
  const lattice = new Uint8Array(total);
  const contrastAt = (key, own) => {
    let contrast = 0;
    const x = key % width;
    const y = (key - x) / width;
    if (x + period < width) {
      const next = channels(key + period);
      if (next.spread <= 16 && next.value >= 168) {
        contrast = Math.max(contrast, Math.abs(own.value - next.value));
      }
    }
    if (y + period < height) {
      const next = channels(key + period * width);
      if (next.spread <= 16 && next.value >= 168) {
        contrast = Math.max(contrast, Math.abs(own.value - next.value));
      }
    }
    return contrast;
  };
  for (let key = 0; key < total; key += 1) {
    const own = channels(key);
    if (own.spread > 16 || own.value < 168) continue;
    if (contrastAt(key, own) >= 14 && !protectedKey(key)) lattice[key] = 1;
  }
  for (let pass = 0; pass < 3; pass += 1) {
    const grown = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const key = y * width + x;
        if (lattice[key]) continue;
        const own = channels(key);
        if (own.spread > 16 || own.value < 168) continue;
        let near = 0;
        if (x > 0 && lattice[key - 1]) near += 1;
        if (x + 1 < width && lattice[key + 1]) near += 1;
        if (y > 0 && lattice[key - width]) near += 1;
        if (y + 1 < height && lattice[key + width]) near += 1;
        if (near >= 2) grown.push(key);
      }
    }
    if (grown.length === 0) break;
    for (const key of grown) lattice[key] = 1;
  }
  for (let key = 0; key < total; key += 1) {
    if (lattice[key]) transparent[key] = 1;
  }
}

let left = width;
let right = -1;
let top = height;
let bottom = -1;
let cut = 0;

/** Шахматка, зажатая между волосками, с краем не связана: такие карманы убираем по размеру. */
const ISLET_LIGHT = 165;
const ISLET_SPREAD = 16;
const seen = new Uint8Array(total);
const pockets = [];
for (let start = 0; start < total; start += 1) {
  if (seen[start] || transparent[start]) continue;
  const first = channels(start);
  if (first.spread > ISLET_SPREAD || first.value < ISLET_LIGHT) continue;
  const members = [start];
  seen[start] = 1;
  let touchesBorder = false;
  let sum = 0;
  let bright = 0;
  let mid = 0;
  for (let head = 0; head < members.length; head += 1) {
    const key = members[head];
    const own = channels(key).value;
    sum += own;
    if (own >= 248) bright += 1;
    else if (own >= 165 && own <= 215) mid += 1;
    const x = key % width;
    const y = (key - x) / width;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (seen[next] || transparent[next]) continue;
        const color = channels(next);
        if (color.spread > ISLET_SPREAD || color.value < ISLET_LIGHT) continue;
        seen[next] = 1;
        members.push(next);
      }
    }
  }
  pockets.push({
    members,
    touchesBorder,
    checker: bright / members.length >= 0.12 && mid / members.length >= 0.12,
  });
}
for (const pocket of pockets) {
  if (pocket.touchesBorder || !pocket.checker) continue;
  if (protectedKey(pocket.members[0])) continue;
  for (const key of pocket.members) transparent[key] = 1;
}

/** Обрывки фона вокруг прядей: светлый пиксель, зажатый прозрачностью, — это не волос и не белок. */
const SPECK_LIGHT = 140;
const SPECK_SOLID = 8;
const SPECK_CLEAR = 8;
const speck = [];
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const key = y * width + x;
    if (transparent[key]) continue;
    if (
      0.2126 * pixels[key << 2] +
        0.7152 * pixels[(key << 2) + 1] +
        0.0722 * pixels[(key << 2) + 2] <
      SPECK_LIGHT
    )
      continue;
    let solid = 0;
    let clear = 0;
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const nx = Math.min(width - 1, Math.max(0, x + dx));
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        const nkey = ny * width + nx;
        if (transparent[nkey]) clear += 1;
        else solid += 1;
      }
    }
    if (solid <= SPECK_SOLID && clear >= SPECK_CLEAR) speck.push(key);
  }
}
for (const key of speck) transparent[key] = 1;

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const key = y * width + x;
    if (transparent[key]) {
      pixels[(key << 2) + 3] = 0;
      cut += 1;
      continue;
    }
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
}
if (right < 0) {
  console.error('фон занял всю картинку: фигура не найдена');
  process.exit(1);
}

const checkerWidth = checkerRight - checkerLeft + 1;
const checkerHeight = checkerBottom - checkerTop + 1;
const checkerFits =
  checkerRight > checkerLeft &&
  checkerWidth <= width * FULL_SHARE &&
  checkerHeight <= height * FULL_SHARE;

let centerX;
let centerY;
let radius;
if (checkerFits) {
  centerX = (checkerLeft + checkerRight + 1) / 2;
  centerY = (checkerTop + checkerBottom + 1) / 2;
  radius = Math.max(checkerWidth, checkerHeight) / 2;
} else {
  centerX = (left + right + 1) / 2;
  centerY = (top + bottom + 1) / 2;
  radius = Math.max(right - left + 1, bottom - top + 1) / 2;
}
radius = radius * (1 + margin);
const side = Math.round(radius * 2);
const originX = Math.round(centerX - radius);
const originY = Math.round(centerY - radius);

const fromX = Math.max(0, originX);
const fromY = Math.max(0, originY);
const toX = Math.min(width, originX + side);
const toY = Math.min(height, originY + side);

const cutBuffer = await sharp(pixels, { raw: { width, height, channels: 4 } })
  .png()
  .toBuffer();
const region = await sharp(cutBuffer)
  .extract({ left: fromX, top: fromY, width: toX - fromX, height: toY - fromY })
  .png()
  .toBuffer();
const canvas = await sharp({
  create: {
    width: side,
    height: side,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: region, left: fromX - originX, top: fromY - originY }])
  .png()
  .toBuffer();

const output = await sharp(canvas)
  .resize(BOTTOM_SIZE, BOTTOM_SIZE, { kernel: 'lanczos3' })
  .webp({ quality: 92, effort: 6 })
  .toBuffer();
await writeFile(outputPath, output);

console.log(
  `${outputPath}: вырезано фона — ${cut}, круг ${Math.round(radius * 2)} ` +
    `(${checkerFits ? 'по шахматке' : 'по силуэту'}), решётка ${period}:${bestScore} → ${BOTTOM_SIZE}`,
);
