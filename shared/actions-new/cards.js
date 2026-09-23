import { findPlayer, setZoneCards, zoneCards } from '#shared/helpers/base.js';
import { cardKey } from '#shared/helpers/cards.js';

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

/**
 * SET_CARDS — карты игрока: добор, сброс, перенос между зонами и запись готовых карт в зону.
 * params: { playerId, op: 'draw' | 'discard' | 'move' | 'put', count?, cardId?, cardIds?, cards?, from?, to? }
 * Добор не перетасовывает сброс: колода кончается, и пустая колода — это истощение, решает вызывающий.
 * Переносом discard → deck | hand закрываются эффекты «вернуть карту из сброса» (верх колоды — конец массива).
 */
export const SET_CARDS = (partyState, action = {}) => {
  const player = findPlayer(
    partyState,
    action.playerId ?? partyState.turn?.playerId,
  );
  if (!player) {
    throw new Error(`SET_CARDS: игрок ${action.playerId} не найден`);
  }

  if (action.op === 'draw') {
    const count = Math.max(0, Number(action.count ?? 1));
    for (let index = 0; index < count; index += 1) {
      if (zoneCards(player.deck).length === 0) break;
      putCards(player, 'hand', takeTopCards(player, 'deck', 1));
    }
    return partyState;
  }

  if (action.op === 'discard') {
    const from = zoneName(action.from);
    const to = zoneName(action.to ?? 'discard');
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
