/**
 * Значки бойцов для карточки места и карточки героя.
 *
 * **Это моки**: портретов в игре пока нет (`public/art/heroes/…` появится вместе с артом), а карточка
 * без лица читается как строка таблицы. Поэтому у каждого бойца — свой значок из локального набора Lucide
 * (`@iconify-json/lucide`, без сети), а оттенок берётся у героя-владельца (`player.color`): помощники
 * одного пака различаются лицом, а не цветом. Когда появится арт, здесь же появится `portrait`.
 *
 * Иконки **предметов** сюда не входят: у предмета иконка объявлена в его паке
 * (`server/content/heroes/{id}/index.js`, поле `icon`) — это контент, а не показ.
 */
const FACES = {
  'anubis': 'lucide:scale',
  'amat': 'lucide:paw-print',
  'dorothy': 'lucide:footprints',
  'toto': 'lucide:dog',
  'ifrit': 'lucide:flame',
  'ash': 'lucide:cloud',
  'medusa': 'lucide:eye',
  'harpies': 'lucide:feather',
  'tesla': 'lucide:zap',
  'snow-queen': 'lucide:snowflake',
  'crow': 'lucide:bird',
};

/** Значок бойца по его паку: `group` у помощника, `id` у героя; неизвестному — нейтральный щит. */
export const fighterFace = fighter =>
  FACES[String(fighter?.group ?? fighter?.id ?? '')] ?? 'lucide:shield';

export default fighterFace;
