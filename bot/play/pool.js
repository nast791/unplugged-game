import { heroes } from '../../server/content/index.js';

/**
 * Пул героев для прогонов берётся из реестра контента: новый герой попадает в метрики сам, без
 * правок бота. Медуза и Тесла остаются в пуле как эталон оригинала — по ним видно, насколько наши
 * герои равны по винрейту, длине партии, покрытию карт и распределению действий.
 */
export const heroIds = Object.keys(heroes);

/**
 * Эталон оригинала: Медуза и Тесла собраны по числам оригинальных колод, поэтому наши герои
 * сравниваются с ними по всем метрикам (`.docs/hero-balance.md` §4).
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

/** Карты пака с количеством копий: состав колоды в профиле героя считается без партии. */
export const deckCards = heroId => heroes[heroId]?.cards ?? [];

/** Помощники пака — это фигурки, а не карты колоды: в профиле их число и суммарное здоровье. */
export const heroAssistants = heroId => heroes[heroId]?.assistants ?? [];

/** Предметы пака: по ним профиль показывает в том числе ни разу не включившиеся. */
export const heroItems = heroId => heroes[heroId]?.items ?? [];

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
 * Насколько помощник важен герою. Не «сколько раз группа упомянута», а **ломается ли механика**: смерть
 * Амат выключает пелену Анубиса, ворона носит «Клёв в темноте» и возвращается «Вечностью», а одна из трёх
 * гарпий — обычная убыль роя. По этому числу защита решает, тратить ли карту на тело (`policy.js:
 * defenseWeight`), и добивание — за кого платить (`policy.js: attackWeight`).
 */
const importanceCache = new Map();
export const assistantImportance = (heroId, group) => {
  if (group == null) return 0;
  const key = `${heroId}|${group}`;
  const hit = importanceCache.get(key);
  if (hit != null) return hit;

  const pack = heroes[heroId] ?? {};
  const entry = (pack.assistants ?? []).find(fighter => (fighter.group ?? fighter.id) === group);
  const count = Number(entry?.count) || 1;
  // правила умения и предметов читают группу: умер боец — сломалась механика (пелена, обмен, возврат)
  const packRules = [
    ...(pack.skill?.rules ?? []),
    ...(pack.items ?? []).flatMap(item => item.rules ?? []),
  ];
  const mechanical = packRules.some(rule => JSON.stringify(rule).includes(`"${group}"`)) ? 0.6 : 0;
  // карты, привязанные к бойцу (`fighter: 'crow'`): без него они остаются топливом, а не картой. Цену
  // считаем по **силе** карты, а не по числу: ради «Амат разрывает» Амат и держат живой (m02129), а три
  // слабые карты того же помощника такого веса не дают. У эффекта печатного числа нет, его сила — правила.
  const tied = (pack.cards ?? []).filter(card => String(card.fighter ?? '') === group);
  const strengthOf = card =>
    (Number(card.value) || 0) +
    (Number(card.bonus) || 0) +
    (String(card.type) === 'effect' ? (card.rules ?? []).length : 0);
  const best = tied.reduce((max, card) => Math.max(max, strengthOf(card)), 0);
  const cards = Math.min(0.3, 0.04 * best + 0.02 * tied.length);
  // рой (три тела по 1 hp) дешевле: потеря одной гарпии не потеря героя
  const swarm = count >= 3 ? 0.6 : 1;
  const value = Math.min(1, (mechanical + cards) * swarm + (count === 1 ? 0.1 : 0));
  importanceCache.set(key, value);

  return value;
};

/**
 * Упорядоченные пары разных героев. Зеркал нет: `player.id` — это id героя, и валидация запрещает
 * взять одного героя дважды, поэтому партия «сам с собой» не собирается.
 */
export const matchups = (ids = heroIds) =>
  ids.flatMap(heroA => ids.filter(heroB => heroB !== heroA).map(heroB => ({ heroA, heroB })));

/**
 * **Карты-отмены** колоды героя (`.docs/bot-strategies.md` п. 5): у которых в правилах есть
 * `SET_COMBAT { op: 'cancelEffects' }`. Список собирается из контента, а не хардкодом: новая карта с
 * отменой попадает в подсчёт остатка сама, а переименование ничего не ломает. Обходится всё дерево
 * правил — отмена живёт и в `immediately` («Ловкость рук» Дороти), и в `duringCombat` («Врата» Анубиса),
 * и в вариантах `picked` («Резонанс» Теслы).
 *
 * Условия карт при этом не проверяются: остаток считается «сколько таких карт он ещё может достать», а
 * не «сколько из них сейчас сработают» — точная проверка требует чужой руки, которой бот не видит.
 */
const cancelsCache = new Map();
export const cancelCardIds = heroId => {
  const key = String(heroId ?? '');
  const hit = cancelsCache.get(key);
  if (hit != null) return hit;

  const found = new Set();
  const cancels = value => {
    if (Array.isArray(value)) return value.some(cancels);
    if (value == null || typeof value !== 'object') return false;
    if (String(value.action) === 'SET_COMBAT' && String(value.op) === 'cancelEffects') return true;
    return Object.values(value).some(cancels);
  };
  for (const card of heroes[key]?.cards ?? []) {
    if ((card.rules ?? []).some(rule => cancels(rule))) found.add(String(card.id));
  }
  cancelsCache.set(key, found);

  return found;
};
