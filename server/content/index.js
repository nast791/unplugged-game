import arena from './maps/arena.js';
import medusa from './heroes/medusa/index.js';
import medusaCards from './heroes/medusa/cards.js';
import tesla from './heroes/tesla/index.js';
import teslaCards from './heroes/tesla/cards.js';

/**
 * Реестр контента: герои и карты собираются здесь явно.
 * Раньше это делал `import.meta.glob`, но в собранном Nitro-сервере он не работает
 * (`globalThis._importMeta_.glob is not a function`) — API отвечал 500. Новый герой добавляется
 * двумя строками (пак + его колода), карта — одной.
 */
const withCards = (hero, cards) => ({ ...hero, cards });

export const heroes = {
  [medusa.id]: withCards(medusa, medusaCards),
  [tesla.id]: withCards(tesla, teslaCards),
};

export const maps = {
  [arena.id]: arena,
};
