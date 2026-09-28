import { SET_HEALTH } from '#shared/actions/health.js';
import { rules } from '#shared/constants/rules.js';
import { findPlayer, playerHeroes, setZoneCards, zoneCards } from '#shared/helpers/base.js';
import { cardKey } from '#shared/helpers/cards.js';
import { randomPick } from '#shared/helpers/random.js';

const ZONES = ['deck', 'hand', 'discard'];

const zoneName = value => {
  const name = value ?? 'hand';
  if (!ZONES.includes(name)) {
    throw new Error(`SET_CARDS: зона "${name}" (нужны ${ZONES.join(' | ')})`);
  }
  return name;
};

const cardIdsOf = action => {
  if (Array.isArray(action.cardIds)) return action.cardIds;
  if (action.cardId != null) return [action.cardId];
  return [];
};

/** Забрать конкретные карты из зоны (порядок сохраняется). */
const takeCards = (player, name, cardIds) => {
  const zone = zoneCards(player[name]);
  const taken = [];
  for (const cardId of cardIds) {
    const index = zone.findIndex(card => cardKey(card) === String(cardId));
    if (index < 0) {
      throw new Error(`SET_CARDS: карты "${cardId}" нет в зоне "${name}"`);
    }
    taken.push(...zone.splice(index, 1));
  }
  setZoneCards(player, name, zone);
  return taken;
};

/** Забрать count карт с верха зоны (верх — конец массива). */
const takeTopCards = (player, name, count) => {
  const zone = zoneCards(player[name]);
  const size = Math.min(Math.max(0, Number(count) || 0), zone.length);
  const taken = zone.splice(zone.length - size, size);
  setZoneCards(player, name, zone);
  return taken;
};

const putCards = (player, name, cards) => {
  if (cards.length === 0) return;
  const zone = zoneCards(player[name]);
  zone.push(...cards);
  setZoneCards(player, name, zone);
};

/** Истощение: за карту, которой не нашлось в колоде, платит главный герой (помощники — нет). */
const exhaust = (partyState, player) => {
  const heroIds = playerHeroes(player)
    .filter(fighter => Number(fighter.currentHp) > 0)
    .map(fighter => String(fighter.id));
  if (heroIds.length === 0) return;

  SET_HEALTH(partyState, { fighterIds: heroIds, delta: -rules.exhaustionDamage });
};

/**
 * SET_CARDS — карты игрока: добор, сброс, перенос между зонами и запись готовых карт в зону.
 * params: { playerId | of, op: 'draw' | 'discard' | 'move' | 'put', count?, cardId?, cardIds?, cards?, from?, to?, random? }
 * `of` — чей зоной распоряжаемся: нужно эффектам вида «противник сбрасывает карту» (у действия уже есть
 * свой `playerId` — владелец правила). Добор обязательный: если колода кончилась, за каждую недостающую
 * карту главный герой игрока получает rules.exhaustionDamage (истощение), помощники урон не получают.
 * Сброс колоду не перетасовывает. `random: true` берёт карту из зоны случайно (последовательность партии,
 * helpers/random.js) — так работает «сбрасывает 1 случайную карту»: игрок её не выбирает.
 * Переносом discard → deck | hand закрываются эффекты «вернуть карту из сброса» (верх колоды — конец массива).
 */
export const SET_CARDS = (partyState, action = {}) => {
  const player = findPlayer(partyState, action.of ?? action.playerId ?? partyState.turn?.playerId);
  if (!player) {
    throw new Error(`SET_CARDS: игрок ${action.playerId} не найден`);
  }

  if (action.op === 'draw') {
    const count = Math.max(0, Number(action.count ?? 1));
    for (let index = 0; index < count; index += 1) {
      if (zoneCards(player.deck).length === 0) {
        exhaust(partyState, player);
        continue;
      }
      putCards(player, 'hand', takeTopCards(player, 'deck', 1));
    }
    return partyState;
  }

  if (action.op === 'discard') {
    const from = zoneName(action.from);
    const to = zoneName(action.to ?? 'discard');
    if (action.random === true) {
      // случайную карту выбирает последовательность партии, а не игрок
      const card = randomPick(partyState, zoneCards(player[from]));
      if (card) putCards(player, to, takeCards(player, from, [cardKey(card)]));
      return partyState;
    }
    const cardIds = cardIdsOf(action);
    const cards = cardIds.length
      ? takeCards(player, from, cardIds)
      : takeTopCards(player, from, action.count ?? 1);
    putCards(player, to, cards);
    return partyState;
  }

  if (action.op === 'move') {
    const from = zoneName(action.from);
    const to = zoneName(action.to);
    const cardIds = cardIdsOf(action);
    if (cardIds.length === 0) throw new Error('SET_CARDS: move требует cardIds');
    putCards(player, to, takeCards(player, from, cardIds));
    return partyState;
  }

  if (action.op === 'put') {
    const to = zoneName(action.to);
    const cards = Array.isArray(action.cards) ? action.cards : [];
    if (cards.length === 0) throw new Error('SET_CARDS: put требует cards');
    putCards(player, to, cards);
    return partyState;
  }

  throw new Error('SET_CARDS: op (нужны draw | discard | move | put)');
};

export default SET_CARDS;
