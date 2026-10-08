// Запекание **знака** UnPlugged: пиксельная сетка 3×3 и иконки.
//
// Знак — шесть квадратов 24×24 с шагом 29 (сетка 3×3) плюс улетевший квадрат 16: буква U, из которой
// «вынули» верхний правый контакт. Цвета знака — из `docs/ui-plan.md` §9.2.
//
// Здесь же рисуются иконки: `public/favicon.svg`, `favicon.ico` (16/32/48), `favicon-180/192/512.png`
// и `icon-192/512.png` с запасом под круглую маску для манифеста.
//
// Логотип (знак + слово нормальным шрифтом в кривых) собирает `tests/support/bake-wordmark.py`:
// слово — это текст, и для него нужен разбор шрифта, а он в Python (fontTools + HarfBuzz).
//
// Запуск: node tests/support/bake-brand.mjs
// Инструмент разработки: в сборку не входит. Нужен `sharp` (он уже есть в дереве как зависимость Nuxt).
// Прошлая версия знака (скруглённая U + Manrope) лежит в `app/svg/brand/legacy/`.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRAND = path.join(ROOT, 'app', 'svg', 'brand');
const PUBLIC = path.join(ROOT, 'public');

const CYAN = '#22D3EE';
const VIOLET = '#8B5CF6';
const PINK = '#D946EF';
// Те же три цвета на ступень темнее — для светлого фона, иначе голубой на белом слепнет.
const CYAN_D = '#0891B2';
const VIOLET_D = '#7C3AED';
const PINK_D = '#C026D3';
// Фон приложения (`--color-app`): подложка растровых иконок и плитки манифеста.
const APP = '#12161B';

const fmt = value => {
  const text = Number(value)
    .toFixed(2)
    .replace(/\.?0+$/, '');
  return text === '-0' ? '0' : text;
};

const rect = (x, y, w, h) => `M${fmt(x)} ${fmt(y)} H${fmt(x + w)} V${fmt(y + h)} H${fmt(x)} Z`;

const box = (x0, y0, x1, y1) => `${fmt(x0)} ${fmt(y0)} ${fmt(x1 - x0)} ${fmt(y1 - y0)}`;

/* ── знак ─────────────────────────────────────────────────────────────────────────────────────── */

// Квадраты сетки: x, y, размер, прозрачность. Седьмая ячейка (верх правой стойки) улетела.
const GRID = [
  [12, 12, 24, 1],
  [12, 41, 24, 1],
  [12, 70, 24, 1],
  [41, 70, 24, 1],
  [70, 70, 24, 1],
  [70, 41, 24, 1],
];
// Улетевшие квадраты: крупный читается и на 16 px, мелкий — только на большом размере (в иконку не идёт).
const FLYING_BIG = [86, 4, 16, 0.9];
const FLYING_SMALL = [94, 22, 7, 0.5];
const FLYING = [FLYING_BIG, FLYING_SMALL];

const gridPaths = squares => squares.map(([x, y, size]) => rect(x, y, size, size));

const squaresMarkup = (squares, fill) =>
  squares
    .map(
      ([x, y, size, alpha]) =>
        `    <path d="${rect(x, y, size, size)}"${alpha === 1 ? '' : ` opacity="${fmt(alpha)}"`}/>`,
    )
    .join('\n');

/* ── сборка SVG ───────────────────────────────────────────────────────────────────────────────── */

const stamp = note =>
  `  <!--\n    Логотип UnPlugged. Собран бейкером tests/support/bake-brand.mjs — руками не правим,\n    правки теряются при пересборке.\n    ${note}\n    Прошлая версия знака (скруглённая U) — в app/svg/brand/legacy/.\n  -->\n`;

const gradient = (id, { x1, y1, x2, y2, stops }) =>
  `    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(
    x2,
  )}" y2="${fmt(y2)}">\n${stops
    .map(([offset, color]) => `      <stop offset="${offset}" stop-color="${color}"/>`)
    .join('\n')}\n    </linearGradient>`;

/**
 * Знак целиком. `padding` — доля холста вокруг знака: 0 для тесной обрезки, больше для иконки,
 * которой нужно вписаться в круглую маску на домашнем экране.
 * `flying` — какие улетевшие квадраты рисовать: `false` ни одного, `'one'` только крупный
 * (он читается и в 16 px), `'all'` оба (для крупного знака).
 */
const mark = ({ mono = false, flying = 'all', padding = 0 } = {}) => {
  const squares =
    flying === false ? GRID : flying === 'one' ? [...GRID, FLYING_BIG] : [...GRID, ...FLYING];
  const x0 = 12;
  const y0 = flying === false ? 12 : flying === 'one' ? 4 : 4;
  const x1 = flying === false ? 94 : 102;
  const y1 = 94;
  const size = Math.max(x1 - x0, y1 - y0) * (1 + padding * 2);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const defs = mono
    ? ''
    : `  <defs>\n${gradient('up-mark', {
        x1: x0,
        y1: y0,
        x2: x1,
        y2: y1,
        stops: [
          [0, CYAN],
          [0.5, VIOLET],
          [1, PINK],
        ],
      })}\n  </defs>\n`;
  const fill = mono ? 'currentColor' : 'url(#up-mark)';
  const note =
    flying === 'all'
      ? 'Знак целиком, с улетевшими квадратами — для крупного размера (от ~48 px).'
      : flying === 'one'
        ? 'Знак с крупным улетевшим квадратом — для иконки: он читается и в 16 px, мелкий в иконку не идёт.'
        : 'Знак без улетевших квадратов.';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2)}" role="img">
${stamp(note)}  <title>UnPlugged</title>
${defs}  <g fill="${fill}">
${squaresMarkup(squares, fill)}
  </g>
</svg>
`;
};

/* ── растровые иконки ─────────────────────────────────────────────────────────────────────────── */

const raster = async (svg, size) => {
  const width = Number(svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/)[2]);
  const density = Math.max(1, (72 * size) / width);
  return sharp(Buffer.from(svg), { density })
    .ensureAlpha()
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
};

/** PNG на подложке приложения: иконкам домашнего экрана прозрачность не нужна, iOS красит её чёрным. */
const rasterOnApp = async (svg, size) =>
  sharp({ create: { width: size, height: size, channels: 4, background: APP } })
    .composite([{ input: await raster(svg, size), top: 0, left: 0 }])
    .png()
    .toBuffer();

/** ICO из PNG: формат допускает PNG-содержимое внутри контейнера, отдельный кодировщик не нужен. */
const ico = entries => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  entries.forEach((entry, index) => {
    const side = entry.size >= 256 ? 0 : entry.size;
    const at = index * 16;
    directory.writeUInt8(side, at);
    directory.writeUInt8(side, at + 1);
    directory.writeUInt8(0, at + 2);
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(entry.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });
  return Buffer.concat([header, directory, ...entries.map(entry => entry.png)]);
};

/* ── запись ───────────────────────────────────────────────────────────────────────────────────── */

const write = (fullPath, content) => {
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  const rel = path.relative(ROOT, fullPath).replace(/\\/g, '/');
  console.log(
    `${rel}  ${typeof content === 'string' ? `${Buffer.byteLength(content)} Б` : `${content.length} Б`}`,
  );
};

const main = async () => {
  write(path.join(BRAND, 'mark.svg'), mark());
  write(path.join(BRAND, 'mark-mono.svg'), mark({ mono: true }));

  // Иконка — знак **с крупным улетевшим квадратом**: без него вкладка теряет «отключено»,
  // а мелкий квадрат на 16 px даёт полтора пикселя и читается грязью.
  const icon = mark({ flying: 'one' });
  const maskable = mark({ flying: 'one', padding: 0.28 });
  write(path.join(PUBLIC, 'favicon.svg'), icon);
  write(
    path.join(PUBLIC, 'favicon.ico'),
    ico(
      await Promise.all([16, 32, 48].map(async size => ({ size, png: await raster(icon, size) }))),
    ),
  );
  for (const size of [180, 192, 512]) {
    write(path.join(PUBLIC, `favicon-${size}.png`), await rasterOnApp(icon, size));
  }
  // Манифест ссылается именно на эти имена (docs/ui-plan.md: иконок /icon-192.png и /icon-512.png не было).
  for (const size of [192, 512]) {
    write(path.join(PUBLIC, `icon-${size}.png`), await rasterOnApp(maskable, size));
  }
};

await main();
