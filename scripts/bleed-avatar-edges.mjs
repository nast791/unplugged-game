#!/usr/bin/env node
/**
 * Чистка кромки аватара: убрать светлый ореол по контуру и залить цвет под прозрачность.
 *
 * Вырезалка (`C:\Collabs\tools\white_to_alpha.py` + `avatars.py`) оставляет по контуру полосу
 * в несколько пикселей, где альфа почти полная, а цвет — волосы, перемешанные с белым фоном.
 * На тёмной фишке это читается белыми линиями по волосам. Скрипт ищет в полосе кромки цвет
 * середины фигуры и приглушает до неё только светлые пиксели (тёмные детали не трогаются),
 * а под полностью прозрачными пикселями оставляет цвет соседей, чтобы при уменьшении
 * подмешивался волос, а не фон. Альфа не меняется — контур остаётся на месте.
 *
 *   node scripts/bleed-avatar-edges.mjs server/content/heroes/dorothy/images/avatar-dorothy.webp
 */
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const BAND = 2;
const CORE = BAND + 2;
const MAX_BLEED_PASSES = 260;

/** Пиксель "снаружи": настоящая прозрачность или почти прозрачный зазор между прядями. */
const OUTSIDE_ALPHA = 130;

const path = process.argv[2];
if (!path) {
  console.error('укажи путь к webp-аватару');
  process.exit(1);
}

const source = await readFile(path);
const { data, info } = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height } = info;
const pixels = Buffer.from(data);
const total = width * height;

const alphaAt = key => pixels[(key << 2) + 3];
const lumAt = key => {
  const index = key << 2;
  return 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
};

/** Расстояние до прозрачности в шагах (не больше CORE): им размечена полоса кромки. */
const distance = new Int16Array(total).fill(-1);
const queue = [];
for (let key = 0; key < total; key += 1) {
  if (alphaAt(key) < OUTSIDE_ALPHA) {
    distance[key] = 0;
    queue.push(key);
  }
}
for (let head = 0; head < queue.length; head += 1) {
  const key = queue[head];
  const step = distance[key];
  if (step >= CORE) continue;
  const x = key % width;
  const y = (key - x) / width;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nkey = ny * width + nx;
      if (distance[nkey] !== -1) continue;
      distance[nkey] = step + 1;
      queue.push(nkey);
    }
  }
}

/** Цвет фона рядом с точкой: самый светлый из вырезанных соседей (фон светлее волоса, а зазоры между прядями тёмные). */
const backgroundColor = key => {
  const x = key % width;
  const y = (key - x) / width;
  let best = null;
  let bestLum = -1;
  for (let dy = -BAND; dy <= BAND; dy += 1) {
    for (let dx = -BAND; dx <= BAND; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nkey = ny * width + nx;
      if (distance[nkey] !== 0) continue;
      const lum = lumAt(nkey);
      if (lum <= bestLum) continue;
      bestLum = lum;
      const index = nkey << 2;
      best = [pixels[index], pixels[index + 1], pixels[index + 2]];
    }
  }
  return best;
};

const backgroundFloor = 190;
const alphaAt2 = key => pixels[(key << 2) + 3];

/** Самый тёмный пиксель рядом: настоящий цвет волоса, а не смесь с фоном. */
const darkColor = key => {
  const x = key % width;
  const y = (key - x) / width;
  let best = Infinity;
  let bestKey = -1;
  for (let dy = -3; dy <= 3; dy += 1) {
    for (let dx = -3; dx <= 3; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nkey = ny * width + nx;
      if (distance[nkey] < 3) continue;
      const lum = lumAt(nkey);
      if (lum < best) {
        best = lum;
        bestKey = nkey;
      }
    }
  }
  if (bestKey < 0) return null;
  const index = bestKey << 2;
  return [pixels[index], pixels[index + 1], pixels[index + 2]];
};

let unmixed = 0;
let whited = 0;
const NEAR_BACKGROUND = 60;
for (let key = 0; key < total; key += 1) {
  if (distance[key] < 1 || distance[key] > BAND) continue;
  const back = backgroundColor(key);
  if (!back) continue;
  const backLum = 0.2126 * back[0] + 0.7152 * back[1] + 0.0722 * back[2];
  if (backLum < backgroundFloor) continue;
  const here = lumAt(key);
  const index = key << 2;
  if (here >= backLum || backLum - here < NEAR_BACKGROUND) {
    pixels[index + 3] = 0;
    whited += 1;
    continue;
  }
  const dark = darkColor(key);
  if (!dark) continue;
  const darkLum = 0.2126 * dark[0] + 0.7152 * dark[1] + 0.0722 * dark[2];
  if (backLum <= darkLum + 10) continue;
  const coverage = Math.min(1, Math.max(0, (backLum - here) / (backLum - darkLum)));
  if (coverage < 0.15) {
    pixels[index + 3] = 0;
    whited += 1;
    continue;
  }
  for (let channel = 0; channel < 3; channel += 1) {
    pixels[index + channel] = Math.round(dark[channel]);
  }
  pixels[index + 3] = Math.min(alphaAt2(key), Math.round(coverage * 255));
  unmixed += 1;
}

/** Светлая полоска в самой кромке — остаток фона: фон тут темнеет от интерполяции, поэтому сравниваем с волосом рядом. */
const WHITE_SLIVER = 175;
const SLIVER_REACH = 6;
for (let key = 0; key < total; key += 1) {
  if (distance[key] < 1 || distance[key] > SLIVER_REACH) continue;
  if (alphaAt2(key) === 0) continue;
  const here = lumAt(key);
  if (here < WHITE_SLIVER) continue;
  const dark = darkColor(key);
  if (!dark) continue;
  const darkLum = 0.2126 * dark[0] + 0.7152 * dark[1] + 0.0722 * dark[2];
  if (here < darkLum + 45) continue;
  pixels[(key << 2) + 3] = 0;
  whited += 1;
}

/** Одиночные полупрозрачные обрывки фона вокруг прядей читаются точками — убираем всех, кто не держится за фигуру. */
const solid = new Uint8Array(total);
for (let key = 0; key < total; key += 1) solid[key] = alphaAt2(key) >= 200 ? 1 : 0;
const floats = [];
for (let key = 0; key < total; key += 1) {
  const here = alphaAt2(key);
  if (here === 0 || here >= 200) continue;
  const x = key % width;
  const y = (key - x) / width;
  let support = 0;
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const nx = Math.min(width - 1, Math.max(0, x + dx));
      const ny = Math.min(height - 1, Math.max(0, y + dy));
      support += solid[ny * width + nx];
    }
  }
  if (support <= 4) floats.push(key);
}
for (const key of floats) pixels[(key << 2) + 3] = 0;

/** Зубцы и иглы на кромке от JPEG: медиана альфы в узкой полосе снимает одиночные пиксели, форму не размывая. */
const smoothed = new Uint8Array(total);
for (let key = 0; key < total; key += 1) smoothed[key] = alphaAt2(key);
for (let key = 0; key < total; key += 1) {
  if (distance[key] < 1 || distance[key] > 2) continue;
  const x = key % width;
  const y = (key - x) / width;
  const values = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = Math.min(width - 1, Math.max(0, x + dx));
      const ny = Math.min(height - 1, Math.max(0, y + dy));
      values.push(alphaAt2(ny * width + nx));
    }
  }
  values.sort((left, right) => left - right);
  smoothed[key] = values[4];
}
for (let key = 0; key < total; key += 1) pixels[(key << 2) + 3] = smoothed[key];

const neighbours = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** Под прозрачностью — цвет соседей: уменьшение аватара иначе подмешивает старый фон. */
const known = new Uint8Array(total);
for (let key = 0; key < total; key += 1) known[key] = alphaAt(key) > 0 ? 1 : 0;

let filled = 0;
for (let pass = 0; pass < MAX_BLEED_PASSES; pass += 1) {
  const updates = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = y * width + x;
      if (known[key]) continue;
      let red = 0;
      let green = 0;
      let blue = 0;
      let weight = 0;
      for (const [dx, dy] of neighbours) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nkey = ny * width + nx;
        if (!known[nkey]) continue;
        const index = nkey << 2;
        red += pixels[index];
        green += pixels[index + 1];
        blue += pixels[index + 2];
        weight += 1;
      }
      if (weight === 0) continue;
      updates.push([key, red / weight, green / weight, blue / weight]);
    }
  }
  if (updates.length === 0) break;
  for (const [key, red, green, blue] of updates) {
    const index = key << 2;
    pixels[index] = Math.round(red);
    pixels[index + 1] = Math.round(green);
    pixels[index + 2] = Math.round(blue);
    known[key] = 1;
    filled += 1;
  }
}

const output = await sharp(pixels, { raw: { width, height, channels: 4 } })
  .webp({ quality: 92, effort: 6 })
  .toBuffer();

await writeFile(path, output);
console.log(`
${path}: кромка разобрана — ${unmixed}, почти прозрачных — ${whited}, обрывков убрано — ${floats.length}, залито под прозрачностью — ${filled}`);
