export const createRng = seed => {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const shuffle = (items, rng) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Версия артов в адресе: браузер кэширует картинку по URL, и без смены версии новый файл не виден. */
const HERO_ART_VERSION = 27;

/**
 * Адрес арта героя: в паке лежит только имя файла (`images: { hero: 'hero.webp' }`, `image` бойца),
 * а наружу уходит маршрут `/api/content/heroes/{id}/images/{файл}`. Одна точка правды: когда картинки
 * начнёт отдавать бэкенд, здесь меняется только сборка пути.
 */
export const heroImageUrl = (heroId, file) =>
  heroId && file ? `/api/content/heroes/${heroId}/images/${file}?v=${HERO_ART_VERSION}` : null;
