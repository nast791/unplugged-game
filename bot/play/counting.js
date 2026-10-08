import { heroes } from '../../server/content/index.js';
import { cardTypeById } from './pool.js';

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

/** Остаток невиданных карт героя: `Map` id карты → сколько копий ещё может быть у соперника. */
export const unseenOf = (state, heroId, viewerId) => {
  const owner = (state.players ?? []).find(player => String(player.heroId) === String(heroId));
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
  return {
    heroId,
    playerId: owner?.id == null ? null : String(owner.id),
    pooled,
    cards,
    handSize: (owner?.hand?.cards ?? []).length,
    deckSize: (owner?.deck?.cards ?? []).length,
    hiddenInPlay: knowledge.hidden,
  };
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
