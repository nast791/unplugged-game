#!/usr/bin/env node
/**
 * Аватар из готового кадра с альфой: силуэт вписывается в квадрат полотна без полей.
 *
 * Новая обрезка (решение владельца, m00001): исходник рисуется так, что фигура занимает всю
 * высоту кадра, поэтому скрипт не добавляет прозрачных полей, а наоборот — обрезает их по
 * силуэту и вписывает в 512². Композиция кадра при этом не меняется: режется только прозрачное.
 * На фишке картинка вписывается в поле портрета целиком (`avatarDrawBox`), поэтому
 * уши и пряди, торчащие за вписанный круг, остаются видны и могут заходить на серое кольцо.
 *
 *   node scripts/avatar-fit.mjs .workbuddy/new-avatars/toto.png \
 *     server/content/heroes/dorothy/images/avatar-toto.webp
 *
 * `--round` — кадр из сервиса, где портрет нарисован на круглой плашке (аватар пепельного духа):
 * ровный рез по окружности читается в круглой плашке вторым кольцом, поэтому альфа гасится
 * множителем `1 − smoothstep` от 0.82 до 1 радиуса плашки, а кадр подрезается по её квадрату.
 * `--fade=<доля>` и `--fade-to=<доля>` сдвигают это окно: у плашки со светлой фаской гашение
 * обязано кончиться ДО неё (`--fade=0.76 --fade-to=0.90`), иначе фаска остаётся дугой-огрызком
 * рамки в прозрачной зоне (находка m00282).
 * `--size` (512), `--quality` (92), `--margin` (0 — доля стороны, оставленная полем).
 */
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const SIZE = 512;
const ALPHA_CUT = 8;
const FADE_SHARE = 0.82;

const args = process.argv.slice(2);
const paths = args.filter(arg => !arg.startsWith('--'));
const flag = name => args.includes(`--${name}`);
const option = name => {
  const found = args.find(arg => arg.startsWith(`--${name}=`));
  return found ? Number(found.split('=')[1]) : undefined;
};

const [sourcePath, outputPath] = paths;
if (!sourcePath || !outputPath) {
  console.error('укажи исходник и выходной webp');
  process.exit(1);
}

const size = option('size') ?? SIZE;
const quality = option('quality') ?? 92;
const margin = option('margin') ?? 0;
const fadeShare = option('fade') ?? FADE_SHARE;
const fadeTo = option('fade-to') ?? 1;

const smoothstep = (from, to, value) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

const { data, info } = await sharp(await readFile(sourcePath))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height } = info;
const pixels = Buffer.from(data);

// Круглый кадр: гасим альфу по радиусу, чтобы плашку обрезал её собственный круг.
if (flag('round')) {
  const radius = Math.min(width, height) / 2;
  const inner = radius * fadeShare;
  const outer = radius * fadeTo;
  const centreX = width / 2;
  const centreY = height / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x + 0.5 - centreX, y + 0.5 - centreY);
      if (distance <= inner) continue;
      const key = ((y * width + x) << 2) + 3;
      const keep = distance >= outer ? 0 : 1 - smoothstep(inner, outer, distance);
      pixels[key] = Math.round(pixels[key] * keep);
    }
  }
}

let left = width;
let right = -1;
let top = height;
let bottom = -1;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (pixels[((y * width + x) << 2) + 3] <= ALPHA_CUT) continue;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
}
if (right < 0) {
  console.error('в исходнике нет непрозрачных пикселей');
  process.exit(1);
}

const cropWidth = right - left + 1;
const cropHeight = bottom - top + 1;
const scale = (size * (1 - margin * 2)) / Math.max(cropWidth, cropHeight);
const fitWidth = Math.max(1, Math.round(cropWidth * scale));
const fitHeight = Math.max(1, Math.round(cropHeight * scale));

const portrait = await sharp(pixels, { raw: { width, height, channels: 4 } })
  .extract({ left, top, width: cropWidth, height: cropHeight })
  .resize(fitWidth, fitHeight, { kernel: 'lanczos3' })
  .png()
  .toBuffer();

await sharp({
  create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([
    {
      input: portrait,
      left: Math.round((size - fitWidth) / 2),
      top: Math.round((size - fitHeight) / 2),
    },
  ])
  .webp({ quality, effort: 6 })
  .toFile(outputPath);

console.log(
  `${outputPath}: ${size}×${size}, силуэт ${fitWidth}×${fitHeight} (кадр ${width}×${height})`,
);
