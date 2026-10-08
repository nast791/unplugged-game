import anubis from './heroes/anubis/index.js';
import anubisCards from './heroes/anubis/cards.js';
import dorothy from './heroes/dorothy/index.js';
import dorothyCards from './heroes/dorothy/cards.js';
import ifrit from './heroes/ifrit/index.js';
import ifritCards from './heroes/ifrit/cards.js';
import medusa from './heroes/medusa/index.js';
import medusaCards from './heroes/medusa/cards.js';
import snowQueen from './heroes/snow-queen/index.js';
import snowQueenCards from './heroes/snow-queen/cards.js';
import tesla from './heroes/tesla/index.js';
import teslaCards from './heroes/tesla/cards.js';

/**
 * Реестр контента: герои и карты собираются здесь явно.
 * Раньше это делал `import.meta.glob`, но в собранном Nitro-сервере он не работает
 * (`globalThis._importMeta_.glob is not a function`) — API отвечал 500. Новый герой добавляется
 * двумя строками (пак + его колода), фиксированная карта — одной.
 */
const withCards = (hero, cards) => ({ ...hero, cards });

export const heroes = {
  [anubis.id]: withCards(anubis, anubisCards),
  [dorothy.id]: withCards(dorothy, dorothyCards),
  [ifrit.id]: withCards(ifrit, ifritCards),
  [medusa.id]: withCards(medusa, medusaCards),
  [snowQueen.id]: withCards(snowQueen, snowQueenCards),
  [tesla.id]: withCards(tesla, teslaCards),
};

/**
 * Фиксированных карт сейчас нет: поле собирает генератор по сиду партии (`mapId: 'generated'`).
 * Реестр оставлен пустым объектом — на него смотрят валидация запроса и список карт в лобби.
 */
export const maps = {};
