import { heroes } from '../../server/content/index.js';

/**
 * Пул героев для прогонов берётся из реестра контента: новый герой попадает в метрики сам, без
 * правок бота. Медуза и Тесла остаются в пуле как эталон оригинала — по ним видно, насколько наши
 * герои равны по винрейту, длине партии, покрытию карт и распределению действий.
 */
export const heroIds = Object.keys(heroes);

/**
 * Эталон оригинала: Медуза и Тесла собраны по числам оригинальных колод, поэтому наши герои
 * сравниваются с ними по всем метрикам (`docs/hero-balance.md` §4).
 */
export const referenceHeroIds = ['medusa', 'tesla'];

/** Имя героя для отчёта: русское название из пака. */
export const heroName = heroId => heroes[heroId]?.name ?? String(heroId);

/** Уникальные карты колоды героя — знаменатель покрытия. */
export const deckCardIds = heroId => [
  ...new Set((heroes[heroId]?.cards ?? []).map(card => card.id)),
];

/** Сколько копий в колоде: неполная колода (у Снежной королевы пока 22) сразу видна в отчёте. */
export const deckSize = heroId =>
  (heroes[heroId]?.cards ?? []).reduce((sum, card) => sum + (Number(card.quantity) || 1), 0);

/** Тип карты по её id — по нему действие раскладывается на атаку, защиту и эффект. */
export const cardTypeById = () => {
  const types = new Map();
  for (const heroId of heroIds) {
    for (const card of heroes[heroId]?.cards ?? []) types.set(card.id, card.type);
  }
  return types;
};

/**
 * Определения карт по id: бот знает **свою** колоду — как игрок, который её собрал: `rules`, `options`,
 * `tags`, число и усиление. Нужно там, где карта уже не лежит в зоне (объявлена в бою, ушла в сброс),
 * а окно её свойства ещё открыто. Реестр статичный, поэтому собирается один раз.
 */
const cardsById = new Map(
  heroIds.flatMap(heroId => (heroes[heroId]?.cards ?? []).map(card => [card.id, card])),
);

/** Определение карты по id (без номера копии): `tesla_02` → карта из контента. */
export const cardById = cardId => cardsById.get(String(cardId)) ?? null;

/**
 * Метки, которые кормят ресурс героя: у Снежной королевы осколок — это метка `shard` на карте, а её
 * предмет-табло называется так же. Карта с такой меткой в сбросе не топливо, а вложение.
 */
export const resourceTags = heroId =>
  new Set([
    ...(heroes[heroId]?.tags ?? []).map(String),
    ...(heroes[heroId]?.items ?? []).map(item => String(item.id)),
  ]);

/**
 * Стихии героя из паспорта: на них он играет сильнее (карты проверяют стихию фактами, а политике это
 * подсказка, куда вставать). Движок `terrainAffinity` не читает — поле живёт только в паспорте.
 */
export const terrainAffinity = heroId => (heroes[heroId]?.terrainAffinity ?? []).map(String);

/**
 * Упорядоченные пары разных героев. Зеркал нет: `player.id` — это id героя, и валидация запрещает
 * взять одного героя дважды, поэтому партия «сам с собой» не собирается.
 */
export const matchups = (ids = heroIds) =>
  ids.flatMap(heroA => ids.filter(heroB => heroB !== heroA).map(heroB => ({ heroA, heroB })));
