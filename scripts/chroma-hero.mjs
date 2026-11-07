// Арт героя с зелёного хромакея: снимает зелёную заливку (мягкая альфа + despill), режет по силуэту,
// ставит фигуру на прозрачный квадрат и пишет WebP. node scripts/chroma-hero.mjs <in> <out> [--size 1024]
import sharp from 'sharp';
import path from 'node:path';

const T_LO = 20;
const T_HI = 120;
const KEEP_ALPHA = 0.1;
const UNMIX_CAP = 2;
const DESPILL = 6;
const HOLE_MAX = 4000;
const PAD = 1.12;

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const [input, output] = positional;
if (!input || !output) {
  console.error('usage: node scripts/chroma-hero.mjs <input> <output> [--size 1024] [--quality 82]');
  process.exit(1);
}
const SIZE = Number.parseInt(flag('--size') ?? '1024', 10);
const QUALITY = Number.parseInt(flag('--quality') ?? '82', 10);

const { data: rgb, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const total = width * height;

const borderPixel = (x, y) => (y * width + x) * 4;
const bgSum = [0, 0, 0];
let bgCount = 0;
for (let x = 0; x < width; x++) {
  for (const y of [0, height - 1]) {
    const i = borderPixel(x, y);
    for (let c = 0; c < 3; c++) bgSum[c] += rgb[i + c];
    bgCount++;
  }
}
for (let y = 0; y < height; y++) {
  for (const x of [0, width - 1]) {
    const i = borderPixel(x, y);
    for (let c = 0; c < 3; c++) bgSum[c] += rgb[i + c];
    bgCount++;
  }
}
const bg = bgSum.map(v => v / bgCount);

const alpha = new Float32Array(total);
const green = new Float32Array(total);
for (let p = 0; p < total; p++) {
  const i = p * 4;
  const g = rgb[i + 1] - Math.max(rgb[i], rgb[i + 2]);
  green[p] = g;
  alpha[p] = Math.min(1, Math.max(0, (T_HI - g) / (T_HI - T_LO)));
}

// дырки в силуэте (просветы между пальцами, в волосах) — не фон, их возвращаем фигуре
const outside = new Uint8Array(total);
const stack = new Int32Array(total);
let top = 0;
const isBackground = p => alpha[p] < 0.5;
for (let x = 0; x < width; x++) {
  for (const y of [0, height - 1]) {
    const p = y * width + x;
    if (isBackground(p) && !outside[p]) {
      outside[p] = 1;
      stack[top++] = p;
    }
  }
}
for (let y = 0; y < height; y++) {
  for (const x of [0, width - 1]) {
    const p = y * width + x;
    if (isBackground(p) && !outside[p]) {
      outside[p] = 1;
      stack[top++] = p;
    }
  }
}
while (top > 0) {
  const p = stack[--top];
  const x = p % width;
  const y = (p - x) / width;
  const neighbours = [
    x > 0 ? p - 1 : -1,
    x < width - 1 ? p + 1 : -1,
    y > 0 ? p - width : -1,
    y < height - 1 ? p + width : -1,
  ];
  for (const n of neighbours) {
    if (n >= 0 && !outside[n] && isBackground(n)) {
      outside[n] = 1;
      stack[top++] = n;
    }
  }
}

const island = new Int32Array(total).fill(-1);
let islandCount = 0;
for (let p = 0; p < total; p++) {
  if (!isBackground(p) || outside[p] || island[p] >= 0) continue;
  const label = islandCount++;
  island[p] = label;
  stack[0] = p;
  let size = 1;
  top = 1;
  while (top > 0) {
    const q = stack[--top];
    const x = q % width;
    const y = (q - x) / width;
    const neighbours = [
      x > 0 ? q - 1 : -1,
      x < width - 1 ? q + 1 : -1,
      y > 0 ? q - width : -1,
      y < height - 1 ? q + width : -1,
    ];
    for (const n of neighbours) {
      if (n >= 0 && island[n] < 0 && !outside[n] && isBackground(n)) {
        island[n] = label;
        stack[top++] = n;
        size++;
      }
    }
  }
  if (size < HOLE_MAX) {
    for (let q = 0; q < total; q++) if (island[q] === label) alpha[q] = 1;
  }
}

// разбор цвета кромки по смеси с фоном: наблюдаемое = a·цвет + (1−a)·фон, коэффициент ограничен,
// иначе на почти прозрачной кромке белого предмета вылезает розовая кайма
const out = Buffer.from(rgb);
const nearOpaque = 0.995;
for (let p = 0; p < total; p++) {
  let a = alpha[p];
  if (a < KEEP_ALPHA) a = 0;
  alpha[p] = a;
  if (a <= 0 || a >= nearOpaque) continue;
  const i = p * 4;
  const k = Math.min((1 - a) / a, UNMIX_CAP);
  for (let c = 0; c < 3; c++) {
    const value = rgb[i + c] + k * (rgb[i + c] - bg[c]);
    out[i + c] = Math.min(255, Math.max(0, Math.round(value)));
  }
}

for (let p = 0; p < total; p++) {
  const i = p * 4;
  const limit = Math.max(out[i], out[i + 2]) + DESPILL;
  if (out[i + 1] > limit) out[i + 1] = Math.min(255, Math.round(limit));
}

const soft = Float32Array.from(alpha);
const kernel = [1, 2, 1];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let weight = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const w = kernel[dx + 1] * kernel[dy + 1];
        sum += alpha[ny * width + nx] * w;
        weight += w;
      }
    }
    const value = (sum / weight - 0.02) / 0.96;
    const p = y * width + x;
    soft[p] = alpha[p] <= 0 ? 0 : Math.min(1, Math.max(0, value));
  }
}

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (soft[y * width + x] * 255 <= 8) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;
const side = Math.max(cropW, cropH, Math.round(Math.max(cropW, cropH) * PAD));

const square = Buffer.alloc(side * side * 4, 0);
const offsetX = Math.round((side - cropW) / 2);
const offsetY = Math.round((side - cropH) / 2);
for (let y = 0; y < cropH; y++) {
  for (let x = 0; x < cropW; x++) {
    const src = ((y + minY) * width + (x + minX)) * 4;
    const dst = ((y + offsetY) * side + (x + offsetX)) * 4;
    square[dst] = out[src];
    square[dst + 1] = out[src + 1];
    square[dst + 2] = out[src + 2];
    square[dst + 3] = Math.round(soft[(y + minY) * width + (x + minX)] * 255);
  }
}

const result = await sharp(square, { raw: { width: side, height: side, channels: 4 } })
  .resize(SIZE, SIZE, { fit: 'fill', kernel: 'lanczos3' })
  .webp({ quality: QUALITY, alphaQuality: 100, effort: 6, smartSubsample: false })
  .toFile(output);

console.log(
  `✅ ${path.basename(input)} → ${path.basename(output)}: фон rgb(${bg.map(v => Math.round(v)).join(' ')})` +
    `, силуэт ${cropW}×${cropH}, холст ${side}² → ${SIZE}², ${(result.size / 1024).toFixed(1)} KB`,
);
