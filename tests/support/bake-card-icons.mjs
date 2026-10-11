/**
 * Пекарь иконок карточки места (`app/svg/game/*.svg`) — четыре значка, которых нет в локальной
 * коллекции Lucide (`@nuxt/icon` её одну и держит, `nuxt.config.ts`): роль героя (человек, ИИ),
 * дальность перемещения (след) и дальность атаки (цеп).
 *
 * Источник — Iconify API (`https://icones.js.org` — та же коллекция глазами):
 *   material-symbols:person-pin-rounded   → role-person.svg
 *   material-symbols-light:model-training → role-ai.svg
 *   material-symbols:footprint            → move.svg
 *   game-icons:flail                      → attack.svg
 *
 * Иконки **файлы проекта**, а не пакет: у каждой свой `currentColor` (цвет задаёт компонент),
 * `width`/`height` — `1em` (размер задаёт класс), поэтому разметка в `PlayerCard.vue` короткая,
 * а новая коллекция не тянет в бандл сотни чужих значков.
 *
 * `role-ai.svg` сейчас **на карточке не стоит**: по макету у ИИ значка роли нет — имя игрока и имя героя
 * различаются строкой. Файл печём на будущее: если роль ИИ вернётся в разметку, значок уже готов.
 *
 * Запуск: `node tests/support/bake-card-icons.mjs`
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Значок → файл: имя файла — роль в карточке, а не имя коллекции. */
const ICONS = {
  'material-symbols:person-pin-rounded': 'role-person.svg',
  'material-symbols-light:model-training': 'role-ai.svg',
  'material-symbols:footprint': 'move.svg',
  'game-icons:flail': 'attack.svg',
};

/** Одна строка шапки: откуда значок и что он значит в карточке. */
const header = name =>
  `<!-- ${name} (Iconify, https://icones.js.org) — значок карточки места; цвет наследуется (currentColor). -->`;

const normalise = (svg, name) => {
  const body = svg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();

  return [
    header(name),
    '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">',
    body,
    '</svg>',
    '',
  ].join('\n');
};

const outDir = fileURLToPath(new URL('../../app/svg/game/', import.meta.url));
await mkdir(outDir, { recursive: true });

for (const [name, file] of Object.entries(ICONS)) {
  const url = `https://api.iconify.design/${name.replace(':', '/')}.svg`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);

  const svg = await response.text();
  // game-icons держит свой viewBox 512×512 — он в теле значка, а `viewBox="0 0 24 24"` шапки затирается
  const source = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 24 24';
  const result = normalise(svg, name).replace('viewBox="0 0 24 24"', `viewBox="${source}"`);

  await writeFile(new URL(file, `file://${outDir.replace(/\\/g, '/')}/`), result, 'utf8');
  console.log(`${file} ← ${name} (${result.length} байт)`);
}
