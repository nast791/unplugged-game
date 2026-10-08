import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Растровые плитки текстур для стихий, которые владелец выбрал картинками (лава, пустыня, горы,
 * вода):
 * собираются из свободных SVG-референсов в `.refs/patterns`. Плитка — квадрат со стороной `CELLS`,
 * доска кладёт её на клетку и обрезает сектором стихии.
 *
 * Лава — кинцуги: фон уводим в коричневый, жилы остаются золотыми. Прежние прозрачные трещины
 * по красной заливке остались запасным вариантом (`lava-cracks-gold.webp`).
 *
 * Формат — WebP: на фотографичной осыпи и акварельном песке он в разы легче PNG при том же виде,
 * прозрачность лавы он тоже держит. Сторона плитки 512 — вдвое больше, чем нужно клетке на экране
 * (радиус до 64 при diameter 1.05 даёт ~134 px): запас на экраны с двойной плотностью и на зум доски.
 * Эталон вида — сами плитки в `public/patterns`; скрипт пишет пробу для просмотра глазами.
 *
 * Запуск: node tests/support/bake-tiles.mjs
 * Инструмент разработки: в сборку не входит.
 */

const OUT = 'public/patterns';
// проба для просмотра глазами: проект не мусорим, кладём её в системный temp
const PROBE = join(tmpdir(), 'unplugged-tiles-probe.png');
const CELLS = 512;
// у каменной осыпи плитка меньше: исходник — «векторизованное» фото, и при 512 его щели между
// камнями смазываются в серую массу
const CELLS_STONES = 256;
const LAVA_CRACKS = 'gold'; // 'gold' — золотые трещины (эталон), 'dark' — почти чёрные

const SOURCES = {
  cracks: '.refs/patterns/26933757_grunge_style_cracked_texture_2501 (1).svg',
  sand: '.refs/patterns/sand-texture.svg',
  stones: '.refs/patterns/mountain-texture.svg',
  water: '.refs/patterns/water-texture.svg',
  forest: '.refs/patterns/forest-branches.png',
  ice: '.refs/patterns/ice-snowflakes.jpg',
  kintsugi: '.refs/patterns/lava-kintsugi.jpg',
};

// качество WebP: акварельному песку и мрамору воды хватает 80 (на клетке это 134 px из 512),
// лаве и каменной осыпи — выше: у первой тонкие линии, у второй мелкая фактура
const WEBP = { quality: 80, alphaQuality: 100, effort: 6 };
// у лавы тонкие линии, у гор — фотографичная осыпь: им качество нужно выше, иначе клетка выглядит мягкой
const WEBP_LINES = { quality: 88, alphaQuality: 100, effort: 6 };
const WEBP_DETAIL = { quality: 88, alphaQuality: 100, effort: 6 };
// мелкая фактура камней сжимается хуже, зато их плитка вчетверо легче — качество берём с запасом
const WEBP_STONES = { quality: 92, alphaQuality: 100, effort: 6 };

const clamp = value => Math.max(0, Math.min(255, Math.round(value)));

/**
 * Прозрачная плитка трещин. Обычно в исходнике трещины тёмные на белом фоне, и альфу берём
 * из темноты — `(255 - яркость - cut) * boost`; `veins: true` — обратный случай (светлые жилы
 * на тёмном, как в кинцуги): `(яркость - cut) * boost`. `cut` отсекает фон, `boost` уплотняет линии.
 */
const crackTile = async ({ file, cut, boost, color, veins = false }) => {
  const { data, info } = await sharp(file, { density: 300 })
    .resize(CELLS, CELLS, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let index = 0; index < info.width * info.height; index += 1) {
    const alpha = clamp(((veins ? data[index] : 255 - data[index]) - cut) * boost);
    rgba[index * 4] = color[0];
    rgba[index * 4 + 1] = color[1];
    rgba[index * 4 + 2] = color[2];
    rgba[index * 4 + 3] = alpha;
  }
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
};

/**
 * Дуотон: яркость исходника раскладываем между двумя цветами. Так у воды остаётся вся фактура
 * (глубина и пена), но цвет клетки — палитровый, а не тёмно-синий, как в исходнике.
 */
const duotone = (data, dark, light) => {
  const rgb = Buffer.alloc(data.length * 3);
  for (let index = 0; index < data.length; index += 1) {
    const mix = data[index] / 255;
    rgb[index * 3] = clamp(dark[0] + (light[0] - dark[0]) * mix);
    rgb[index * 3 + 1] = clamp(dark[1] + (light[1] - dark[1]) * mix);
    rgb[index * 3 + 2] = clamp(dark[2] + (light[2] - dark[2]) * mix);
  }
  return rgb;
};

/**
 * Непрозрачная плитка из фотографичной фактуры: квадратный кроп по центру (доска кладёт плитку
 * на квадрат, вытянутый исходник на ней сплющился бы), затем дуотон в цвета стихии.
 */
const toneTile = async ({ file, crop, dark, light, brightness = 1, density = null }) => {
  const source = sharp(file, density ? { density } : {});
  if (crop) source.extract(crop);
  const { data, info } = await source
    .resize(CELLS, CELLS, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = brightness === 1 ? data : data.map(value => clamp(value * brightness));
  const tinted = duotone(rgb, dark, light);
  return sharp(tinted, { raw: { width: info.width, height: info.height, channels: 3 } })
    .png()
    .toBuffer();
};

/**
 * Плитка из чёрного рисунка с прозрачностью: цвет ветвей задаём сами, альфу берём из исходника
 * (можно усилить). Такая плитка ложится поверх заливки стихии, и просветы остаются цветом стихии.
 */
const branchTile = async ({ file, crop, size = CELLS, color, boost = 1 }) => {
  const source = sharp(file);
  if (crop) source.extract(crop);
  const { data, info } = await source
    .resize(size, size, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let index = 0; index < info.width * info.height; index += 1) {
    rgba[index * 4] = color[0];
    rgba[index * 4 + 1] = color[1];
    rgba[index * 4 + 2] = color[2];
    rgba[index * 4 + 3] = Math.max(0, Math.min(255, Math.round(data[index * 4 + 3] * boost)));
  }
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
};

/**
 * Плитка из картинки с неровным светом: делим на сильно размытую копию и приводим к целевому
 * среднему цвету. Так уходит радиальный блик исходника, а фактура (снежинки) остаётся.
 */
const flatTile = async ({ file, crop, size = CELLS, target, sigma = 35 }) => {
  const base = await sharp(file)
    .extract(crop)
    .resize(size, size, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blur = await sharp(file)
    .extract(crop)
    .resize(size, size, { fit: 'fill' })
    .blur(sigma)
    .removeAlpha()
    .raw()
    .toBuffer();
  const rgb = Buffer.alloc(size * size * 3);
  for (let index = 0; index < size * size; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value =
        (base.data[index * 3 + channel] / Math.max(1, blur[index * 3 + channel])) * target[channel];
      rgb[index * 3 + channel] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }
  return sharp(rgb, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
};

/**
 * Непрозрачная плитка «фон + жилы»: яркость исходника ведёт от цвета фона к цвету жил.
 * Так у кинцуги коричневый фон остаётся фактурным, а жилы — золотыми.
 */
const veinTile = async ({ file, ground, vein, size = CELLS }) => {
  const { data } = await sharp(file)
    .resize(size, size, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = Buffer.alloc(size * size * 3);
  for (let index = 0; index < size * size; index += 1) {
    const lum = 0.299 * data[index * 3] + 0.587 * data[index * 3 + 1] + 0.114 * data[index * 3 + 2];
    const mix = Math.max(0, Math.min(1, (lum - 55) / 120));
    for (let channel = 0; channel < 3; channel += 1) {
      const value = ground[channel] + (vein[channel] - ground[channel]) * mix;
      rgb[index * 3 + channel] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }
  return sharp(rgb, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
};

const main = async () => {
  mkdirSync(OUT, { recursive: true });

  // лава: тёмные линии исходника → альфа, цвет трещин свой
  const gold = await crackTile({ file: SOURCES.cracks, cut: 6, boost: 2.8, color: [245, 197, 78] });
  const dark = await crackTile({ file: SOURCES.cracks, cut: 10, boost: 2.4, color: [17, 24, 39] });
  await sharp(gold).webp(WEBP_LINES).toFile(`${OUT}/lava-cracks-gold.webp`);
  await sharp(dark).webp(WEBP_LINES).toFile(`${OUT}/lava-cracks.webp`);

  // пустыня: кроп акварельного исходника сверху — нижняя светлая размывка в клетку не попадает
  await sharp(SOURCES.sand)
    .extract({ left: 100, top: 0, width: 560, height: 560 })
    .resize(CELLS, CELLS, { fit: 'fill' })
    .linear([1.08, 1.03, 0.88], [0, 0, 0])
    .webp(WEBP)
    .toFile(`${OUT}/desert-sand.webp`);

  // горы: каменная осыпь исходника. Рендерим вектор крупно и уменьшаем до 256 — так щели между
  // камнями остаются на клетке видимыми (при 512 они размывались в серую массу)
  await sharp(SOURCES.stones, { density: 288 })
    .resize(CELLS_STONES, CELLS_STONES, { fit: 'fill' })
    .greyscale()
    .modulate({ brightness: 1.22 })
    .webp(WEBP_STONES)
    .toFile(`${OUT}/mountain-stones.webp`);

  // лава: кинцуги — фон уводим в коричневый, жилы остаются золотыми
  const veins = await veinTile({
    file: SOURCES.kintsugi,
    ground: [124, 47, 36],
    vein: [245, 197, 78],
  });
  await sharp(veins).webp(WEBP_DETAIL).toFile(`${OUT}/lava-veins.webp`);

  // лёд: снежинки исходника; блик по центру картинки убираем выравниванием света
  const ice = await flatTile({
    file: SOURCES.ice,
    crop: { left: 0, top: 0, width: 300, height: 300 },
    target: [200, 230, 246],
  });
  await sharp(ice).webp(WEBP_DETAIL).toFile(`${OUT}/ice-snowflakes.webp`);

  // лес: силуэты ветвей из исходника — чёрная тушь с прозрачностью, поэтому кладём их
  // поверх заливки стихии: цвет задаём сами, сквозь просветы видно зелёный
  await sharp(
    await branchTile({
      file: SOURCES.forest,
      crop: { left: 620, top: 120, width: 760, height: 760 },
      color: [22, 84, 44],
      boost: 1.15,
    }),
  )
    .webp({ quality: 80, alphaQuality: 90, effort: 6 })
    .toFile(`${OUT}/forest-canopy.webp`);

  // вода: мраморная фактура исходника в цветах палитры — глубокая вода и пена
  const water = await toneTile({
    file: SOURCES.water,
    crop: { left: 262, top: 0, width: 675, height: 675 },
    // цвета ближе к исходнику: глубокая вода — сланец, пена — холодный белый
    dark: [16, 60, 78],
    light: [186, 224, 232],
  });
  await sharp(water).webp(WEBP).toFile(`${OUT}/water-marble.webp`);

  // проба: те же клетки, что рисует доска, — чтобы смотреть результат глазами
  const probe = [
    { label: 'лёд', fill: '#CFE9F7', tile: 'ice-snowflakes.webp' },
    { label: 'лава', fill: '#DF301C', tile: 'lava-veins.webp' },
    { label: 'лес', fill: '#349948', tile: 'forest-canopy.webp' },
    { label: 'пустыня', fill: '#F0DFA8', tile: 'desert-sand.webp' },
    { label: 'горы', fill: '#C2CBD8', tile: 'mountain-stones.webp' },
    { label: 'вода', fill: '#2E9FB8', tile: 'water-marble.webp' },
  ];
  const radius = 100;
  const box = 246;
  const width = probe.length * box;
  const height = 260;
  // пробу рисуем во встроенном PNG: просмотрщик SVG внутри sharp читает WebP не всегда
  const cells = (
    await Promise.all(
      probe.map(async (cell, index) => {
        const cx = index * box + box / 2;
        const cy = 110;
        const png = await sharp(`${OUT}/${cell.tile}`).png().toBuffer();
        const href = `data:image/png;base64,${png.toString('base64')}`;
        const side = radius * 2 * 1.05;
        return [
          `<clipPath id="clip-${index}"><circle cx="${cx}" cy="${cy}" r="${radius}"/></clipPath>`,
          `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${cell.fill}"/>`,
          `<g clip-path="url(#clip-${index})"><image xlink:href="${href}" x="${cx - side / 2}" y="${cy - side / 2}" width="${side}" height="${side}" preserveAspectRatio="xMidYMid slice"/></g>`,
          `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#1E293B" stroke-width="3"/>`,
          `<text x="${cx}" y="${cy + radius + 30}" font-family="Arial" font-size="15" text-anchor="middle" fill="#334155">${cell.label}</text>`,
        ].join('\n');
      }),
    )
  ).join('\n');
  await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#eef1f4"/>${cells}</svg>`,
    ),
  )
    .png()
    .toFile(PROBE);

  console.log(`плитки: ${OUT} (лава — трещины «${LAVA_CRACKS}»), проба: ${PROBE}`);
};

await main();
