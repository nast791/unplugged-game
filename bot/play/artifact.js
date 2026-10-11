/**
 * Какой **артефакт тренера** играет: выбор модели снаружи (`--artifact=…` в инструментах, `SEARCH_ARTIFACT`
 * в переменных среды), а не только вшитый в бандл `bot/play/qvalue-weights.js`.
 *
 * Зачем: до этого модуля в игре физически жила **одна** модель на оба места, поэтому «новая версия против
 * старой» и «ученик против ученика» были невыразимы — `--policy=qvalue --policy-b=qvalue` давал одну и ту же
 * модель с двух сторон. Теперь у каждой стороны может быть свой файл, и версии сравниваются лицом к лицу,
 * без общего эталона.
 *
 * Правила:
 * - путь — из рабочей папки запуска (`bot/tools/*`, `bot/learn/*`), браузера это не касается: в бандле
 *   путь не задаётся и берётся вшитый артефакт;
 * - **`node:` здесь нет намеренно.** Модуль попадает в клиентский бандл (`bot/play/ai.js` → `vs_ai` →
 *   `bot/play/qvalue.js`), а `node:fs` в браузере — это `Cannot access "node:fs.readFileSync" in client
 *   code` от Vite и `undefined` вместо чтения. Поэтому файл читает node-сторона
 *   (`bot/play/artifact-file.js`): она подключает чтение сама, а этот модуль о нём только спрашивает;
 * - принимается и JSON тренера (`trainer/artifacts/*.json`), и зеркало для бандла
 *   (`bot/play/qvalue-weights.js` — из него вырезается `export default …`);
 * - таблицы кэшируются по пути: один файл грузится один раз на процесс (в партии это тысячи обращений).
 */
import live from './qvalue-weights.js';

/** Кэш загруженных артефактов: путь → таблица. */
const tables = new Map();

/** Чтение файла артефакта: путь → таблица. Подключает node-сторона (`bot/play/artifact-file.js`). */
let readArtifact = null;

/**
 * Подключить чтение артефакта с диска. В браузере загрузчика нет и быть не должно: там артефакт приходит
 * готовым объектом (`null` — вшитый в бандл), а строка-путь означает ошибку вызова, а не файл.
 */
export const useArtifactFiles = reader => {
  readArtifact = reader;
};

/**
 * Артефакт по ссылке: `null`/пусто — вшитый в бандл (`qvalue-weights.js`), строка — путь к файлу,
 * объект — уже загруженная таблица.
 */
export const tableOf = (artifact = null) => {
  if (artifact == null || artifact === '') return live;
  if (typeof artifact === 'object') return artifact;

  const key = String(artifact);
  const cached = tables.get(key);
  if (cached != null) return cached;

  // строка-путь на node: читает `bot/play/artifact-file.js`, его тянет вход прогонов (`duel.js`).
  // В браузере загрузчика нет — и это правильный ответ: путей там не бывает.
  if (readArtifact == null)
    throw new Error(
      `артефакт по пути читается только на node (${key}): загрузчик подключает bot/play/artifact-file.js`,
    );

  const table = readArtifact(key);
  tables.set(key, table);
  return table;
};

/** Короткая подпись артефакта для отчётов: имя файла или «живой». */
export const artifactName = (artifact = null) => {
  if (artifact == null || artifact === '') return 'живой';
  if (typeof artifact === 'object') return 'таблица';
  return String(artifact).replace(/\\/g, '/').split('/').pop();
};
