/**
 * Шесть стихий поля. У клетки основная стихия (`node.terrain`) задаёт цвет заливки; у клеток
 * на стыке зон стихий две-три (тогда рисуем сектора). Палитра и правила показа — `docs/terrain.md`.
 *
 * Цвета яркие и контрастные: на доске стихии должны различаться с первого взгляда, как на референсах.
 * `pattern` — обязательный узор-подсказка, чтобы цвет не был единственным различием;
 * `patternColor` (необязательно) — свой цвет текстуры: у лавы золото, у льда почти белый.
 *
 * Клетки без стихии не бывает: стихию задаёт карта или генератор, а `server/create.js` проверяет
 * это при создании партии. Поэтому запасной стихии здесь нет, а неизвестный id — ошибка, а не повод
 * что-то подставить: молча нарисованная «какая-то» стихия врёт игроку про области поля.
 */
export const TERRAIN = {
  ice: { id: 'ice', name: 'Лёд', color: '#CFE9F7', pattern: 'frost', patternColor: '#F4FBFF' },
  forest: { id: 'forest', name: 'Лес', color: '#349948', pattern: 'dots' },
  mountains: { id: 'mountains', name: 'Горы', color: '#C2CBD8', pattern: 'triangles' },
  lava: {
    id: 'lava',
    name: 'Лава',
    color: '#e8453a',
    pattern: 'cracks',
    patternColor: '#F7C846',
  },
  desert: { id: 'desert', name: 'Пустыня', color: '#F0DFA8', pattern: 'dunes' },
  water: { id: 'water', name: 'Вода', color: '#2E9FB8', pattern: 'waves' },
};

export const TERRAIN_IDS = Object.keys(TERRAIN);

export const isTerrainId = id => Object.prototype.hasOwnProperty.call(TERRAIN, String(id ?? ''));

export const terrainInfo = id => (isTerrainId(id) ? TERRAIN[String(id)] : null);

/** Имя стихии для сообщений: у неизвестного id показываем сам id, чтобы было понятно, что чинить. */
export const terrainName = id => terrainInfo(id)?.name ?? String(id ?? '');

const requireTerrain = id => {
  const info = terrainInfo(id);
  if (!info) throw new Error(`Неизвестная стихия "${String(id ?? '')}"`);
  return info;
};

export const terrainColor = id => requireTerrain(id).color;

export const terrainPattern = id => requireTerrain(id).pattern;

/** Относительная яркость цвета (0 — чёрный, 1 — белый): по ней выбираем цвет подписи клетки. */
export const colorLuminance = color => {
  const hex = String(color ?? '').replace('#', '');
  if (hex.length !== 6) return 1;
  const channels = [0, 2, 4].map(index => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

/** Цвет подписи на заливке: берём тот, у которого выше контраст с цветом клетки. */
export const terrainLabelColor = id => {
  const luminance = colorLuminance(terrainColor(id));
  const withWhite = 1.05 / (luminance + 0.05);
  const withDark = (luminance + 0.05) / 0.05;
  return withWhite >= withDark ? '#F8FAFC' : '#111827';
};

/**
 * Цвет текстуры стихии: **плотный** — силу рисует слой своей прозрачностью, иначе два множителя
 * гасят друг друга и текстуру не видно. Свой цвет задаётся в палитре (`patternColor`: у лавы золото,
 * у льда почти белый), остальным он выбирается по контрасту с заливкой тем же сравнением, что и
 * подпись: у светлых заливок текстура тёмная, у по-настоящему тёмных — светлая.
 */
export const terrainPatternColor = id => {
  const own = terrainInfo(id)?.patternColor;
  if (own) return own;
  const luminance = colorLuminance(terrainColor(id));
  const withWhite = 1.05 / (luminance + 0.05);
  const withDark = (luminance + 0.05) / 0.05;
  // цвет плотный: силу текстуры задаёт прозрачность слоя, иначе два множителя гасят друг друга
  return withDark >= withWhite ? '#0F172A' : '#FFFFFF';
};

export default TERRAIN;
