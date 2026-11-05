// Разовая выпечка двух новых плиток (маковые поля, мёртвые земли), не трогая остальные.
// Полный `tests/support/bake-tiles.mjs` перезаписал бы плитки, нарисованные вручную.
import sharp from 'sharp';

const OUT = 'public/patterns';
const SIZE = 512;
const WEBP = { quality: 88, alphaQuality: 100, effort: 6 };

const poppyTile = async ({ ground, blade, petal, core, grass = 300, count = 230 }) => {
  const blades = Array.from({ length: grass }, (_, index) => {
    const x = (index * 71) % SIZE;
    const height = SIZE * (0.06 + ((index * 31) % 100) / 320);
    const bend = (((index * 43) % 60) - 30) * 0.4;
    return `<path d="M ${x} ${SIZE} Q ${x + bend} ${SIZE - height * 0.6} ${x + bend * 2} ${SIZE - height}" stroke="rgb(${blade.join(',')})" stroke-width="1" fill="none" opacity="0.35"/>`;
  }).join('');
  const flowers = Array.from({ length: count }, (_, index) => {
    const cx = (index * 97 + ((index * 29) % 23)) % SIZE;
    const cy = (index * 149 + ((index * 53) % 31)) % SIZE;
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="rgb(${ground.join(',')})"/>${blades}${flowers}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

const ashTile = async ({ ground, crack, grit, count = 120 }) => {
  const cracks = Array.from({ length: count }, (_, index) => {
    const x = (index * 131) % SIZE;
    const y = (index * 173) % SIZE;
    const dx = (((index * 53) % 140) - 70) * 0.9;
    const dy = (((index * 89) % 140) - 70) * 0.9;
    const mx = x + dx * 0.55 + (((index * 37) % 24) - 12);
    const my = y + dy * 0.55 + (((index * 61) % 24) - 12);
    const width = 1 + ((index * 7) % 3);
    const opacity = (0.35 + ((index * 23) % 45) / 100).toFixed(2);
    return `<path d="M ${x} ${y} Q ${mx.toFixed(0)} ${my.toFixed(0)} ${(x + dx).toFixed(0)} ${(y + dy).toFixed(0)}" stroke="rgb(${crack.join(',')})" stroke-width="${width}" fill="none" opacity="${opacity}"/>`;
  }).join('');
  const specks = Array.from({ length: 260 }, (_, index) => {
    const cx = (index * 61) % SIZE;
    const cy = (index * 113) % SIZE;
    const radius = 1 + ((index * 5) % 3);
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="rgb(${grit.join(',')})" opacity="${(0.12 + ((index * 19) % 35) / 100).toFixed(2)}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="rgb(${ground.join(',')})"/>${specks}${cracks}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

const poppy = await poppyTile({
  ground: [104, 136, 68],
  blade: [64, 96, 44],
  petal: [196, 54, 44],
  core: [46, 34, 30],
});
await sharp(poppy).webp(WEBP).toFile(`${OUT}/poppy-field.webp`);

const dead = await ashTile({
  ground: [92, 88, 80],
  crack: [42, 40, 36],
  grit: [176, 168, 152],
});
await sharp(dead).webp(WEBP).toFile(`${OUT}/dead-ground.webp`);

console.log('готово: poppy-field.webp, dead-ground.webp');
