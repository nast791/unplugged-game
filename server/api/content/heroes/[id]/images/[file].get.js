import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3';
import { heroes } from '../../../../../content/index.js';

const TYPES = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/** Разрешены только файлы, объявленные самим паком: имя из запроса не превращается в путь на диске. */
const declaredFiles = pack => {
  if (!pack) return new Set();
  const files = new Set();
  for (const file of Object.values(pack.images ?? {})) if (file) files.add(String(file));
  for (const fighter of [...(pack.heroes ?? []), ...(pack.assistants ?? [])]) {
    if (fighter?.image) files.add(String(fighter.image));
  }
  return files;
};

/**
 * Арт героя из его пака: `/api/content/heroes/dorothy/images/hero.webp`.
 * Файлы лежат в `server/content/heroes/{id}/images/`, объявлены в `index.js` (`images` и `image` бойцов).
 * Когда картинки начнёт отдавать бэкенд, этот маршрут станет не нужен — адреса собирает `heroImageUrl`.
 */
export default defineEventHandler(async event => {
  const id = String(getRouterParam(event, 'id') ?? '').trim();
  const file = String(getRouterParam(event, 'file') ?? '').trim();
  const pack = heroes[id];

  if (!pack) {
    throw createError({ statusCode: 404, statusMessage: `неизвестный герой "${id}"` });
  }
  if (!declaredFiles(pack).has(file)) {
    throw createError({ statusCode: 404, statusMessage: `у героя "${id}" нет арта "${file}"` });
  }

  const extension = file.slice(file.lastIndexOf('.')).toLowerCase();
  const type = TYPES[extension];
  if (!type) {
    throw createError({ statusCode: 415, statusMessage: `неизвестный формат арта "${extension}"` });
  }

  const relative = `heroes/${pack.id}/images/${file}`;
  // Сначала рядом с исходником маршрута (dev), потом от корня проекта: собранный сервер кладёт файл
  // маршрута в другой каталог, и первый путь там не сходится.
  const candidates = [
    new URL(`../../../../../content/${relative}`, import.meta.url),
    new URL(`server/content/${relative}`, pathToFileURL(`${process.cwd()}/`)),
  ];
  let payload = null;
  for (const candidate of candidates) {
    try {
      payload = await readFile(candidate);
      break;
    } catch {
      payload = null;
    }
  }
  if (!payload) {
    throw createError({ statusCode: 404, statusMessage: `файл арта не найден: ${file}` });
  }

  setHeader(event, 'Content-Type', type);
  setHeader(event, 'Cache-Control', 'public, max-age=300, must-revalidate');
  return payload;
});
