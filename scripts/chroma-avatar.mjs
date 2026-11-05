// Аватар с фона-хромакея: зелёная заливка и светлое поле вокруг снимаются по цвету, а не заливкой от краёв.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const BOTTOM_SIZE = 512;
const GREEN_STRONG = 40;
const GREEN_SOFT = 8;
const GREEN_EDGE = 32;
const WHITE_FLOOR = 200;
const WHITE_SPREAD = 55;
const WHITE_GREEN = 45;

const args = process.argv.slice(2);
const paths = args.filter(arg => !arg.startsWith('--'));
const option = name => {
  const found = args.find(arg => arg.startsWith(`--${name}=`));
  return found ? Number(found.slice(name.length + 3)) : null;
};
const [sourcePath, outputPath] = paths;
if (!sourcePath || !outputPath) {
  console.error('использование: node scripts/chroma-avatar.mjs <источник> <результат.webp>');
  process.exit(1);
}
const margin = option('margin') ?? 0;
const zoom = option('zoom') ?? 1;
const lift = option('lift') ?? 0;
const maskTop = option('mask-top') === 1;
const bottomShare = option('bottom') ?? 1;

const { data, info } = await sharp(await readFile(sourcePath))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height } = info;
const pixels = Buffer.from(data);
const total = width * height;

const red = key => pixels[key << 2];
const green = key => pixels[(key << 2) + 1];
const blue = key => pixels[(key << 2) + 2];
const alphaAt = key => pixels[(key << 2) + 3];
const keyOf = (x, y) => y * width + x;
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

const greenness = key => green(key) - Math.max(red(key), blue(key));
const neutral = key =>
  Math.max(red(key), green(key), blue(key)) - Math.min(red(key), green(key), blue(key));
const luminance = key => 0.2126 * red(key) + 0.7152 * green(key) + 0.0722 * blue(key);
/** Светлый нейтральный или бледно-зелёный фон вокруг диска: белое поле, а бывает и шахматка с зелёным оттенком. */
const pale = key =>
  luminance(key) >= WHITE_FLOOR && neutral(key) <= WHITE_SPREAD && greenness(key) <= WHITE_GREEN;

const background = new Uint8Array(total);
let greenCut = 0;
for (let key = 0; key < total; key += 1) {
  if (greenness(key) > GREEN_STRONG) {
    background[key] = 1;
    greenCut += 1;
  }
}

const whiteQueue = [];
for (let x = 0; x < width; x += 1) {
  whiteQueue.push(keyOf(x, 0), keyOf(x, height - 1));
}
for (let y = 0; y < height; y += 1) {
  whiteQueue.push(keyOf(0, y), keyOf(width - 1, y));
}
let whiteCut = 0;
for (let head = 0; head < whiteQueue.length; head += 1) {
  const key = whiteQueue[head];
  if (background[key]) continue;
  if (!pale(key)) continue;
  background[key] = 1;
  whiteCut += 1;
  const x = key % width;
  const y = (key - x) / width;
  for (const [dx, dy] of neighbours) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const nkey = ny * width + nx;
    if (background[nkey]) continue;
    if (!pale(nkey)) continue;
    whiteQueue.push(nkey);
  }
}

const nearBackground = key => {
  const x = key % width;
  const y = (key - x) / width;
  for (const [dx, dy] of neighbours) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (background[ny * width + nx]) return true;
  }
  return false;
};

let soft = 0;
let despilled = 0;
for (let key = 0; key < total; key += 1) {
  if (background[key]) {
    pixels[(key << 2) + 3] = 0;
    continue;
  }
  const index = key << 2;
  const here = greenness(key);
  if (here > GREEN_SOFT && nearBackground(key)) {
    const share = Math.min(1, Math.max(0, (GREEN_EDGE - here) / (GREEN_EDGE - GREEN_SOFT)));
    pixels[index + 3] = Math.round(alphaAt(key) * share);
    soft += 1;
  }
  if (here > GREEN_SOFT) {
    pixels[index + 1] = Math.min(green(key), Math.max(red(key), blue(key)) + 6);
    despilled += 1;
  }
}

/** Кромка диска: между белым полем и зелёной заливкой остаётся светло-зелёная полоса — она и не «зелёная», и не «белая». */
const reach = new Int16Array(total).fill(-1);
const reachQueue = [];
for (let key = 0; key < total; key += 1) {
  if (!background[key]) continue;
  reach[key] = 0;
  reachQueue.push(key);
}
for (let head = 0; head < reachQueue.length; head += 1) {
  const key = reachQueue[head];
  const step = reach[key];
  if (step >= 4) continue;
  const x = key % width;
  const y = (key - x) / width;
  for (const [dx, dy] of neighbours) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const nkey = ny * width + nx;
    if (reach[nkey] !== -1) continue;
    reach[nkey] = step + 1;
    reachQueue.push(nkey);
  }
}

let rim = 0;
for (let key = 0; key < total; key += 1) {
  if (alphaAt(key) === 0) continue;
  const step = reach[key];
  if (step < 1 || step > 3) continue;
  const edgePale = pale(key);
  const speck = greenness(key) > 25;
  if (!edgePale && !speck) continue;
  pixels[(key << 2) + 3] = 0;
  rim += 1;
}

/** Зелёная кайма на кончиках шерсти: у самой прозрачности пиксель подмешивает цвет диска — зелёный гасим и придерживаем альфу. */
let fringe = 0;
for (let key = 0; key < total; key += 1) {
  const step = reach[key];
  if (step < 1 || step > 3) continue;
  if (alphaAt(key) === 0) continue;
  const spill = greenness(key);
  if (spill <= 6) continue;
  pixels[(key << 2) + 1] = Math.min(pixels[(key << 2) + 1], Math.max(red(key), blue(key)));
  if (spill > 10) pixels[(key << 2) + 3] = Math.round(alphaAt(key) * 0.4);
  fringe += 1;
}

/** Пунктир от кромки диска: у самого края слабая альфа — остаток фона, а концы прядей чуть подтягиваем. */
let dashed = 0;
for (let key = 0; key < total; key += 1) {
  const step = reach[key];
  if (step < 1 || step > 4) continue;
  const alpha = alphaAt(key);
  if (alpha === 0) continue;
  if (alpha < 70) {
    pixels[(key << 2) + 3] = 0;
    dashed += 1;
    continue;
  }
  if (alpha < 200) pixels[(key << 2) + 3] = Math.min(255, Math.round(alpha * 1.6));
}

/** Обрывки кромки без опоры: полупрозрачный пиксель, вокруг которого почти нет плотной фигуры. */
const solid = new Uint8Array(total);
for (let key = 0; key < total; key += 1) solid[key] = alphaAt(key) >= 200 ? 1 : 0;
let drops = 0;
for (let key = 0; key < total; key += 1) {
  const alpha = alphaAt(key);
  if (alpha === 0 || alpha >= 200) continue;
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
  if (support > 6) continue;
  pixels[(key << 2) + 3] = 0;
  drops += 1;
}

const seen = new Uint8Array(total);
let island = 0;
for (let key = 0; key < total; key += 1) {
  if (seen[key] || alphaAt(key) !== 0) continue;
  const islandQueue = [key];
  seen[key] = 1;
  let size = 0;
  let touchesEdge = false;
  for (let head = 0; head < islandQueue.length; head += 1) {
    const current = islandQueue[head];
    size += 1;
    const x = current % width;
    const y = (current - x) / width;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
    for (const [dx, dy] of neighbours) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nkey = ny * width + nx;
      if (seen[nkey] || alphaAt(nkey) !== 0) continue;
      seen[nkey] = 1;
      islandQueue.push(nkey);
    }
  }
  if (!touchesEdge && size > 4) island += size;
}

let left = width;
let right = -1;
let top = height;
let bottom = -1;
for (let key = 0; key < total; key += 1) {
  if (alphaAt(key) === 0) continue;
  const x = key % width;
  const y = (key - x) / width;
  if (x < left) left = x;
  if (x > right) right = x;
  if (y < top) top = y;
  if (y > bottom) bottom = y;
}
if (right < 0) {
  console.error('фигура не найдена: прозрачным стало всё');
  process.exit(1);
}

const columnCount = new Uint32Array(width);
const rowCount = new Uint32Array(height);
for (let key = 0; key < total; key += 1) {
  if (!background[key]) continue;
  if (greenness(key) <= GREEN_STRONG) continue;
  const x = key % width;
  columnCount[x] += 1;
  rowCount[(key - x) / width] += 1;
}
/** Одиночные зелёные пиксели на кромке не должны раздувать габарит диска: считаем только плотные строки и столбцы. */
const DISC_DENSITY = 8;
const discLeft = columnCount.findIndex(count => count >= DISC_DENSITY);
const discRight = columnCount.findLastIndex(count => count >= DISC_DENSITY);
const discTop = rowCount.findIndex(count => count >= DISC_DENSITY);
const discBottom = rowCount.findLastIndex(count => count >= DISC_DENSITY);
const discFits =
  discRight > discLeft &&
  discRight - discLeft + 1 < width * 0.98 &&
  discBottom - discTop + 1 < height * 0.98;

/** Круг достраиваем по видимым дугам: низ диска занимает фигура, и обрезка по габаритам зелёного срезала бы грудь линейкой. */
const centerX = discFits ? (discLeft + discRight + 1) / 2 : (left + right + 1) / 2;
const centerY = discFits ? discTop + (discRight - discLeft + 1) / 2 : (top + bottom + 1) / 2;
const baseRadius = discFits
  ? (discRight - discLeft + 1) / 2
  : Math.max(right - left + 1, bottom - top + 1) / 2;
const radius = (baseRadius / zoom) * (1 + margin);
const side = Math.round(radius * 2);
const originX = Math.round(centerX - radius);
const originY = Math.round(centerY - radius + radius * lift);

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
  create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: region, left: fromX - originX, top: fromY - originY }])
  .png()
  .toBuffer();

/** Плечи в исходнике упираются в край кадра — без этой маски низ фишки получает срез линейкой вместо дуги. */
const maskShape = Buffer.from(
  maskTop
    ? (() => {
        const cx = side / 2;
        const rb = (side / 2) * bottomShare;
        const path = `M0 0 H${side} V${cx} L${cx + rb} ${cx} A${rb} ${rb} 0 0 1 ${cx - rb} ${cx} L0 ${cx} Z`;
        return `<svg width="${side}" height="${side}"><path d="${path}" fill="#fff"/></svg>`;
      })()
    : `<svg width="${side}" height="${side}"><circle cx="${side / 2}" cy="${side / 2}" r="${side / 2 - 1}" fill="#fff"/></svg>`,
);
const masked = await sharp(canvas)
  .composite([{ input: maskShape, blend: 'dest-in' }])
  .png()
  .toBuffer();

const output = await sharp(masked)
  .resize(BOTTOM_SIZE, BOTTOM_SIZE, { kernel: 'lanczos3' })
  .webp({ quality: 92, effort: 6 })
  .toBuffer();
await writeFile(outputPath, output);

console.log(
  `${outputPath}: зелёного снято — ${greenCut}, белого — ${whiteCut}, мягких кромок — ${soft}, ` +
    `зелёный оттенок убран — ${despilled}, кромка диска — ${rim}, кайма шерсти — ${fringe}, пунктир — ${dashed}, ` +
    `карманов фона — ${island}, круг ${Math.round(baseRadius * 2)} ` +
    `(${discFits ? 'по зелёному диску' : 'по силуэту'}) → ${BOTTOM_SIZE}`,
);
