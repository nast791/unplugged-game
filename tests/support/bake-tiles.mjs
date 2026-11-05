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
 * Лава — кинцуги: фон уводим в коричневый, жилы остаются золотыми.
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

const SOURCES = {
  sand: '.refs/patterns/sand-texture.svg',
  stones: '.refs/patterns/mountain-texture.svg',
  water: '.refs/patterns/water-texture.svg',
  forest: '.refs/patterns/forest-branches.webp',
  ice: '.refs/patterns/ice-snowflakes.jpg',
  kintsugi: '.refs/patterns/lava-kintsugi.jpg',
  cracked: '.refs/patterns/26933757_grunge_style_cracked_texture_2501 (1).svg',
  botanical: '.refs/patterns/vecteezy_luxury-botanical-art-background_20478570.svg',
  pastel:
    '.refs/patterns/vecteezy_colorful-pastel-drawing-paper-texture-vector-bright-banner_7740962.svg',
};

// качество WebP: акварельному песку и мрамору воды хватает 80 (на клетке это 134 px из 512),
// лаве и каменной осыпи — выше: у первой тонкие линии, у второй мелкая фактура
const WEBP = { quality: 80, alphaQuality: 100, effort: 6 };
const WEBP_DETAIL = { quality: 88, alphaQuality: 100, effort: 6 };
// мелкая фактура камней сжимается хуже, зато их плитка вчетверо легче — качество берём с запасом
const WEBP_STONES = { quality: 92, alphaQuality: 100, effort: 6 };

const clamp = value => Math.max(0, Math.min(255, Math.round(value)));

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

/**
 * Непрозрачная плитка «ковыль»: стебли рисуем сами — в исходниках травы нет. Наклон и высота
 * считаются от индекса, поэтому плитка повторяема и не зависит от Math.random.
 */
const grassTile = async ({ size = CELLS, ground, blade, count = 340 }) => {
  const blades = Array.from({ length: count }, (_, index) => {
    const x = (index * 97) % size;
    const height = size * (0.2 + ((index * 37) % 100) / 180);
    const bend = (((index * 53) % 80) - 40) * 0.5;
    const width = 1 + ((index * 13) % 3);
    const opacity = 0.25 + ((index * 29) % 70) / 100;
    return `<path d="M ${x} ${size} Q ${x + bend} ${size - height * 0.55} ${x + bend * 2} ${size - height}" stroke="rgb(${blade.join(',')})" stroke-width="${width}" fill="none" opacity="${opacity.toFixed(2)}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="rgb(${ground.join(',')})"/>${blades}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

/**
 * Споры поверх готовой плитки: круги и кольца считаются от индекса, поэтому рисунок повторяем.
 * Нужны грибнице: акварельный фон сам по себе читается как облако, а не как грибная земля.
 */
const sporeTile = async ({ base, size = CELLS, color, count = 240 }) => {
  const png = await sharp(base).png().toBuffer();
  const href = `data:image/png;base64,${png.toString('base64')}`;
  const dots = Array.from({ length: count }, (_, index) => {
    const cx = (index * 89) % size;
    const cy = (index * 151) % size;
    const radius = 1 + ((index * 7) % 6);
    const opacity = (0.15 + ((index * 31) % 60) / 100).toFixed(2);
    const ring = index % 11 === 0;
    return ring
      ? `<circle cx="${cx}" cy="${cy}" r="${radius + 4}" fill="none" stroke="rgb(${color.join(',')})" stroke-width="1.5" opacity="${opacity}"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="rgb(${color.join(',')})" opacity="${opacity}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}"><image xlink:href="${href}" width="${size}" height="${size}"/>${dots}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

/**
 * Непрозрачная плитка «маковое поле»: трава с алыми цветами. Цветок — четыре лепестка и тёмная
 * сердцевина; положение и размер считаются от индекса, поэтому плитка повторяема.
 */
const poppyTile = async ({
  size = CELLS,
  ground,
  blade,
  petal,
  core,
  grass = 300,
  count = 230,
}) => {
  const blades = Array.from({ length: grass }, (_, index) => {
    const x = (index * 71) % size;
    const height = size * (0.06 + ((index * 31) % 100) / 320);
    const bend = (((index * 43) % 60) - 30) * 0.4;
    return `<path d="M ${x} ${size} Q ${x + bend} ${size - height * 0.6} ${x + bend * 2} ${size - height}" stroke="rgb(${blade.join(',')})" stroke-width="1" fill="none" opacity="0.35"/>`;
  }).join('');
  const flowers = Array.from({ length: count }, (_, index) => {
    const cx = (index * 97 + ((index * 29) % 23)) % size;
    const cy = (index * 149 + ((index * 53) % 31)) % size;
    const radius = 3 + ((index * 17) % 5);
    const petals = Array.from({ length: 4 }, (_, petalIndex) => {
      const angle = (petalIndex * Math.PI) / 2 + (((index * 11) % 17) / 17) * 0.6;
      const px = cx + Math.cos(angle) * radius * 0.85;
      const py = cy + Math.sin(angle) * radius * 0.85;
      const degrees = (angle * 180) / Math.PI;
      return `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${(radius * 0.85).toFixed(1)}" ry="${(radius * 0.6).toFixed(1)}" fill="rgb(${petal.join(',')})" transform="rotate(${degrees.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)})" opacity="0.92"/>`;
    }).join('');
    return `${petals}<circle cx="${cx}" cy="${cy}" r="${(radius * 0.32).toFixed(1)}" fill="rgb(${core.join(',')})"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="rgb(${ground.join(',')})"/>${blades}${flowers}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

/**
 * Непрозрачная плитка «мёртвая земля»: сухая серая почва, редкие трещины и крупинки пепла.
 * Ни травы, ни огня — только выжженный грунт, поэтому рисунок строится на трещинах.
 */
const ashTile = async ({ size = CELLS, ground, crack, grit, count = 120 }) => {
  const cracks = Array.from({ length: count }, (_, index) => {
    const x = (index * 131) % size;
    const y = (index * 173) % size;
    const dx = (((index * 53) % 140) - 70) * 0.9;
    const dy = (((index * 89) % 140) - 70) * 0.9;
    const mx = x + dx * 0.55 + (((index * 37) % 24) - 12);
    const my = y + dy * 0.55 + (((index * 61) % 24) - 12);
    const width = 1 + ((index * 7) % 3);
    const opacity = (0.35 + ((index * 23) % 45) / 100).toFixed(2);
    return `<path d="M ${x} ${y} Q ${mx.toFixed(0)} ${my.toFixed(0)} ${(x + dx).toFixed(0)} ${(y + dy).toFixed(0)}" stroke="rgb(${crack.join(',')})" stroke-width="${width}" fill="none" opacity="${opacity}"/>`;
  }).join('');
  const specks = Array.from({ length: 260 }, (_, index) => {
    const cx = (index * 61) % size;
    const cy = (index * 113) % size;
    const radius = 1 + ((index * 5) % 3);
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="rgb(${grit.join(',')})" opacity="${(0.12 + ((index * 19) % 35) / 100).toFixed(2)}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="rgb(${ground.join(',')})"/>${specks}${cracks}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

const main = async () => {
  mkdirSync(OUT, { recursive: true });

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

  // кристаллы: белая плитка с чёрными трещинами; трещины уводим в тёмно-лиловый
  const crystal = await toneTile({
    file: SOURCES.cracked,
    dark: [96, 72, 136],
    light: [204, 186, 238],
  });
  await sharp(crystal).webp(WEBP_DETAIL).toFile(`${OUT}/crystal-shards.webp`);

  // болото: тёмная ботаника с золотыми линиями; листья — глубокий мох, просветы — олива
  const swamp = await toneTile({
    file: SOURCES.botanical,
    dark: [50, 62, 28],
    light: [170, 192, 96],
    brightness: 1.05,
  });
  await sharp(swamp).webp(WEBP_DETAIL).toFile(`${OUT}/swamp-moss.webp`);

  // грибница: акварельная пастель в лилово-розовых спорах, сверху — круги и кольца спор
  const fungusBase = await toneTile({
    file: SOURCES.pastel,
    dark: [104, 54, 80],
    light: [214, 168, 196],
    brightness: 1.02,
  });
  const fungus = await sporeTile({ base: fungusBase, color: [118, 66, 94] });
  await sharp(fungus).webp(WEBP_DETAIL).toFile(`${OUT}/fungus-spores.webp`);

  // маковые поля: траву и цветы рисуем сами — в исходниках мака нет
  const poppy = await poppyTile({
    ground: [104, 136, 68],
    blade: [64, 96, 44],
    petal: [196, 54, 44],
    core: [46, 34, 30],
  });
  await sharp(poppy).webp(WEBP_DETAIL).toFile(`${OUT}/poppy-field.webp`);

  // мёртвые земли: выжженный грунт с трещинами и пеплом — тоже рисуем сами
  const dead = await ashTile({
    ground: [92, 88, 80],
    crack: [42, 40, 36],
    grit: [176, 168, 152],
  });
  await sharp(dead).webp(WEBP_DETAIL).toFile(`${OUT}/dead-ground.webp`);

  // проба: те же клетки, что рисует доска, — чтобы смотреть результат глазами
  const probe = [
    { label: 'лёд', fill: '#CFE9F7', tile: 'ice-snowflakes.webp' },
    { label: 'лава', fill: '#DF301C', tile: 'lava-veins.webp' },
    { label: 'лес', fill: '#349948', tile: 'forest-canopy.webp' },
    { label: 'пустыня', fill: '#F0DFA8', tile: 'desert-sand.webp' },
    { label: 'горы', fill: '#C2CBD8', tile: 'mountain-stones.webp' },
    { label: 'вода', fill: '#2E9FB8', tile: 'water-marble.webp' },
    { label: 'кристаллы', fill: '#B9A6E8', tile: 'crystal-shards.webp' },
    { label: 'болото', fill: '#8FA83E', tile: 'swamp-moss.webp' },
    { label: 'грибница', fill: '#C77BA6', tile: 'fungus-spores.webp' },
    { label: 'маковые поля', fill: '#B8393F', tile: 'poppy-field.webp' },
    { label: 'мёртвые земли', fill: '#5E5A50', tile: 'dead-ground.webp' },
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

  console.log(`плитки: ${OUT}, проба: ${PROBE}`);
};

await main();
