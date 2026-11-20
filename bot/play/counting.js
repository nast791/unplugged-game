import { heroes } from '../../server/content/index.js';
import { cancelCardIds, cardById, cardTypeById } from './pool.js';

/**
 * Подсчёт карт: что бот ещё **не видел** у соперника. Список колоды героя открыт, открыт и сброс,
 * поэтому остаток считается вычитанием: полная колода минус сброс минус карты боя, чья личность уже
 * открыта (после вскрытия — обе, иначе своя). Чужой руки бот при этом не видит: он знает только её
 * **размер** (это открыто и живому игроку) и то, из чего она могла быть набрана.
 *
 * Зачем: без честного остатка не бывает ни оценки угрозы («какое число атаки у него ещё может быть»),
 * ни детерминизации для поиска (руку соперника надо сэмплировать из остатка, а не из всей колоды).
 *
 * Тождество остатка (проверяется тестом):
 * `cards === handSize + deckSize + hiddenInPlay` — остаток это в точности неопознанные карты: чужая
 * рука, нераскрытая часть колоды и закрытые карты боя. Вскрытие колоды остаток не меняет: показанная
 * карта всё ещё лежит в колоде, поэтому она входит и в остаток, и в `deckSize`.
 */
const types = cardTypeById();

/** Число карты по id: у карт в остатке есть только id, поэтому реестр чисел собирается один раз. */
const valueById = new Map(
  Object.values(heroes).flatMap(hero =>
    (hero?.cards ?? []).map(card => [card.id, Math.max(0, Number(card.value) || 0)]),
  ),
);

/** Усиление карты по id — второй реестр: сравнение весов Анубиса идёт по усилению, а не по числу. */
const bonusById = new Map(
  Object.values(heroes).flatMap(hero =>
    (hero?.cards ?? []).map(card => [card.id, Math.max(0, Number(card.bonus) || 0)]),
  ),
);

/** Полный список колоды героя с копиями: `tesla_02` ×3 → три записи. */
const deckList = heroId =>
  (heroes[heroId]?.cards ?? []).flatMap(card =>
    Array.from({ length: Math.max(1, Number(card.quantity) || 1) }, () => card.id),
  );

/** id карты без номера копии: в зонах карта лежит с `id` = id карты и отдельным `instanceId`. */
const cardIdOf = card => String(card?.id ?? card?.cardId ?? '');

/**
 * Карты боя: чью личность зритель уже видит и сколько карт владельца лежит в игре закрытыми. Границы
 * те же, что у проекции (`server/party.js: projectCombat`): до вскрытия карту видит только владелец.
 */
const combatKnowledge = (state, viewerId, ownerId) => {
  const combat = state.combat;
  const revealed = ['reveal', 'resolve', 'close'].includes(combat?.stage);
  const mine = String(ownerId) === String(viewerId);
  const seen = [];
  let hidden = 0;

  for (const [card, cardOwner] of [
    [combat?.attackCard, combat?.attackerPlayerId],
    [combat?.defenseCard, combat?.defenderPlayerId],
  ]) {
    if (!card || String(cardOwner) !== String(ownerId)) continue;
    if (revealed || mine) seen.push(card);
    else hidden += 1;
  }

  return { seen, hidden };
};

/**
 * Кэш остатка (§48): за одно решение `unseenOf` зовётся на каждой итерации поиска и в каждом мире
 * (`bot/play/search.js: worldFactory`), а сам остаток между этими вызовами не меняется — меняется только
 * **состояние**, то есть новые объекты зон. Поэтому запись ищется по **тождеству объектов** (владелец,
 * сброс, рука, колода, карты боя): форк движка даёт новые массивы, а внутри одной точки решения они те же.
 * Массив на карту состояния ограничен: как только объект владельца сменился, старая запись уходит.
 */
const unseenCache = new WeakMap();

/** Переключатель кэша остатка для замера вклада (§48): `BOT_CACHE_UNSEEN=0` считает как раньше. */
const unseenCacheOn = () =>
  (typeof process === 'undefined' ? {} : (process.env ?? {})).BOT_CACHE_UNSEEN !== '0';

const sameEntry = (entry, owner, state, viewerId) =>
  entry.owner === owner &&
  entry.discard === owner?.discard?.cards &&
  entry.hand === owner?.hand?.cards &&
  entry.deck === owner?.deck?.cards &&
  entry.attack === state.combat?.attackCard &&
  entry.defense === state.combat?.defenseCard &&
  entry.stage === state.combat?.stage &&
  String(entry.viewer) === String(viewerId);

/** Остаток невиданных карт героя: `Map` id карты → сколько копий ещё может быть у соперника. */
export const unseenOf = (state, heroId, viewerId) => {
  const owner = (state.players ?? []).find(player => String(player.heroId) === String(heroId));

  const cacheable = unseenCacheOn();
  let entries = null;
  if (cacheable) {
    entries = unseenCache.get(state);
    if (entries != null) {
      for (const entry of entries) {
        if (entry.heroId === heroId && sameEntry(entry, owner, state, viewerId)) return entry.value;
      }
    } else {
      entries = [];
      unseenCache.set(state, entries);
    }
    if (entries.length > 8) entries.length = 0;
  }

  const pooled = new Map();
  for (const cardId of deckList(heroId)) pooled.set(cardId, (pooled.get(cardId) ?? 0) + 1);

  const forget = cardId => {
    const rest = (pooled.get(cardId) ?? 0) - 1;
    if (rest > 0) pooled.set(cardId, rest);
    else pooled.delete(cardId);
  };

  // сброс открыт всем: то, что уже сыграно, из остатка уходит
  for (const card of owner?.discard?.cards ?? []) forget(cardIdOf(card));

  const knowledge =
    owner == null ? { seen: [], hidden: 0 } : combatKnowledge(state, viewerId, owner.id);
  for (const card of knowledge.seen) forget(cardIdOf(card));

  const cards = [...pooled.values()].reduce((sum, count) => sum + count, 0);
  const value = {
    heroId,
    playerId: owner?.id == null ? null : String(owner.id),
    pooled,
    cards,
    handSize: (owner?.hand?.cards ?? []).length,
    deckSize: (owner?.deck?.cards ?? []).length,
    hiddenInPlay: knowledge.hidden,
  };
  entries?.push({
    heroId,
    owner,
    discard: owner?.discard?.cards,
    hand: owner?.hand?.cards,
    deck: owner?.deck?.cards,
    attack: state.combat?.attackCard,
    defense: state.combat?.defenseCard,
    stage: state.combat?.stage,
    viewer: viewerId,
    value,
  });
  return value;
};

/** Сводка по соперникам: их остатки и размеры зон. */
export const remainingOf = (state, playerId) => {
  const opponents = (state.players ?? [])
    .filter(player => String(player.id) !== String(playerId))
    .map(player => ({ player, unseen: unseenOf(state, player.heroId, playerId) }));

  return {
    opponents,
    unseen: opponents.reduce((sum, entry) => sum + entry.unseen.cards, 0),
    handSize: opponents.reduce((sum, entry) => sum + entry.unseen.handSize, 0),
    deckSize: opponents.reduce((sum, entry) => sum + entry.unseen.deckSize, 0),
  };
};

/**
 * Ожидаемое число объявленной карты атаки: среднее по картам атаки, которые у соперника ещё **могут**
 * быть. Нужно там, где число скрыто: защитник не видит объявленную карту до вскрытия (`projectCombat`
 * отдаёт её только владельцу), поэтому он решает по остатку колоды — как живой игрок, который помнит,
 * что уже вышло. Скрытая объявленная карта тоже лежит в остатке, поэтому в среднее она входит.
 */
export const expectedAttack = (state, playerId) => {
  let total = 0;
  let count = 0;

  for (const { unseen } of remainingOf(state, playerId).opponents) {
    for (const [cardId, copies] of unseen.pooled) {
      const type = types.get(cardId);
      if (type !== 'attack' && type !== 'hybrid') continue;
      total += copies * (valueById.get(cardId) ?? 0);
      count += copies;
    }
  }

  return count > 0 ? total / count : 0;
};

/** Сколько копий карты ещё может быть у соперников: «осталась ли у него хоть одна отмена». */
export const remainingCount = (state, playerId, cardId) =>
  remainingOf(state, playerId).opponents.reduce(
    (sum, entry) => sum + (entry.unseen.pooled.get(String(cardId)) ?? 0),
    0,
  );

/**
 * **Вероятность, что у соперника в руке есть отмена** (`.docs/bot-strategies.md` п. 5, `.docs/hero-balance.md`
 * §74). Бот не видит чужой руки, но видит её **размер** и точный остаток колоды (`unseenOf`), поэтому
 * вопрос решается подсчётом: сколько карт-отмен ещё не вышло и какова вероятность, что хотя бы одна из них
 * попала в руку из `handSize` карт.
 *
 * Считается по гипергеометрическому распределению (без возвращения): вероятность «ни одной отмены в руке»
 * = произведение `(cards − left − i) / (cards − i)` по `i` от 0 до `handSize − 1`. Порог `minHand` — 3:
 * в руке из одной-двух карт ответа может не быть по определению, и обещание гасить не за что.
 *
 * Ноль — отмен у него не осталось (или рука меньше порога): тогда обещание карты стоит полной цены.
 */
export const cancelRiskOf = (state, playerId, { minHand = 3 } = {}) => {
  let risk = 0;

  for (const { player, unseen } of remainingOf(state, playerId).opponents) {
    if (unseen.handSize < Math.max(1, Number(minHand) || 1)) continue;
    const ids = cancelCardIds(player.heroId);
    if (ids.size === 0) continue;
    let left = 0;
    for (const id of ids) left += unseen.pooled.get(id) ?? 0;
    const total = unseen.cards;
    if (left <= 0 || total <= 0) continue;

    let miss = 1;
    for (let index = 0; index < unseen.handSize; index += 1) {
      const rest = total - index;
      if (rest <= 0) {
        miss = 0;
        break;
      }
      miss *= Math.max(0, rest - left) / rest;
    }
    risk = Math.max(risk, 1 - miss);
  }

  return Math.max(0, Math.min(1, risk));
};

/**
 * Ожидаемое **усиление** карты соперника по остатку его колоды — то же, что `expectedAttack` для числа.
 * Нужно весам Анубиса: «Помилование» и «Наказание» различаются сравнением усилений (моё против чужого), а
 * чужая карта до вскрытия неизвестна. Своё усиление известно точно, чужое берётся средним по тем картам
 * атаки и защиты, которые у него ещё могут быть.
 */
export const expectedBonus = (state, playerId) => {
  let total = 0;
  let count = 0;

  for (const { unseen } of remainingOf(state, playerId).opponents) {
    for (const [cardId, copies] of unseen.pooled) {
      const type = types.get(cardId);
      if (type !== 'attack' && type !== 'defense' && type !== 'hybrid') continue;
      total += copies * (bonusById.get(cardId) ?? 0);
      count += copies;
    }
  }

  return count > 0 ? total / count : 0;
};

/**
 * **Распределение** усиления карты соперника по остатку его колоды: `[{ value, chance }]`, где `chance` —
 * доля невышедших карт боя с таким усилением. Нужно весам Анубиса: «Помилование» и «Наказание» —
 * противоположные половины, и их цена зависит от того, какое усиление придёт. По одному среднему числу
 * одна из половин всегда «не срабатывает», а с распределением обе получают свою вероятность.
 */
export const bonusOutcomes = (state, playerId) => {
  const buckets = new Map();
  let total = 0;

  for (const { unseen } of remainingOf(state, playerId).opponents) {
    for (const [cardId, copies] of unseen.pooled) {
      const type = types.get(cardId);
      if (type !== 'attack' && type !== 'defense' && type !== 'hybrid') continue;
      const bonus = bonusById.get(cardId) ?? 0;
      buckets.set(bonus, (buckets.get(bonus) ?? 0) + copies);
      total += copies;
    }
  }

  if (total === 0) return [{ value: 0, chance: 1 }];

  return [...buckets.entries()]
    .map(([value, copies]) => ({ value, chance: copies / total }))
    .sort((left, right) => left.value - right.value);
};

/** Доля невышедших карт боя, у которых есть хотя бы `min` правил: «есть ли что отменять». */
export const expectedRuleShare = (state, playerId, { min = 1 } = {}) => {
  let withRules = 0;
  let count = 0;

  for (const { unseen } of remainingOf(state, playerId).opponents) {
    for (const [cardId, copies] of unseen.pooled) {
      const type = types.get(cardId);
      if (type !== 'attack' && type !== 'defense' && type !== 'hybrid') continue;
      count += copies;
      if ((cardById(cardId)?.rules ?? []).length >= Math.max(1, Number(min) || 1)) {
        withRules += copies;
      }
    }
  }

  return count > 0 ? withRules / count : 0;
};
