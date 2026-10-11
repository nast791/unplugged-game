/**
 * Чтение артефакта с диска — **node-сторона** выбора модели (`bot/play/artifact.js`).
 *
 * Отдельный модуль ради браузера: `artifact.js` лежит в клиентском бандле (ученик играет в режиме
 * `vs_ai`, `bot/play/ai.js` → `bot/play/qvalue.js`), а `node:fs` в клиенте Vite подменяет заглушкой и
 * пишет `Module "node:fs" has been externalized for browser compatibility. Cannot access
 * "node:fs.readFileSync" in client code`. Читать файлы умеет только node, поэтому чтение живёт здесь, а
 * `artifact.js` получает одну функцию и остаётся чистым для бандла.
 *
 * Кто подключает: вход прогонов и замеров — `bot/play/duel.js` (его импортируют `bot/tools/*`,
 * `bot/learn/*` и воркеры). Отдельный импорт в инструментах не нужен: `useArtifactFiles` пишется здесь
 * на загрузке модуля, то есть до первой партии.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useArtifactFiles } from './artifact.js';

/** Разбор зеркала для бандла: `export default {…};` → объект. */
const parseMirror = source => {
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('в зеркале артефакта нет объекта');
  return JSON.parse(source.slice(start, end + 1));
};

/** Таблица артефакта из файла: JSON тренера (`trainer/artifacts/*.json`) или зеркало для бандла (`.js`). */
export const readArtifactFile = artifact => {
  const path = resolve(String(artifact));
  const source = readFileSync(path, 'utf8');
  return path.endsWith('.js') ? parseMirror(source) : JSON.parse(source);
};

useArtifactFiles(readArtifactFile);

export default readArtifactFile;
