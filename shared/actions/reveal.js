import { findPlayer, setZoneCards, zoneCards } from '#shared/helpers/base.js';
import { cardKey } from '#shared/helpers/cards.js';

/** Раскрытия лежат списком: в одной битве обе стороны могут раскрыть колоду противника. */
const revealOf = (partyState, playerId) =>
  (partyState.reveal ?? []).find(entry => String(entry.playerId) === String(playerId)) ?? null;

/**
 * Чья колода: `of` — id игрока, `'self'` — владелец правила, `$переменная` — id из факта
 * (в бою это противник: `COMBAT { player: 'opponent' }`). Без `of` — активный игрок хода.
 */
const deckOwnerId = (partyState, action) => {
  const of = action.of ?? action.playerId ?? partyState.turn?.playerId;
  if (of === 'self') return action.playerId ?? partyState.turn?.playerId;
  return of;
};

/**
 * SET_REVEAL — «раскрыть карту»: показать её всем.
 * Раскрыть ≠ забрать: карты остаются на верху колоды (следующим добором владелец возьмёт именно их),
 * а в публичном слоте `state.reveal` лежит их снимок — его видят и владелец колоды, и соперники,
 * и напарники в 2v2 (проекция слот не прячет: constants/state.js → stateFields.reveal).
 * Раскрытие живёт до конца битвы: бой закрывается или отменяется — снимок снимается (actions/combat.js).
 * params: { op: 'open', of, count? } — раскрыть верхние карты колоды игрока (только в открытом бою);
 *         { op: 'discard', of }     — раскрытые карты уходят в сброс владельца, снимок снимается;
 *         { op: 'bottom', of }      — раскрытые карты уходят под низ колоды владельца (низ — начало
 *                                     массива), снимок снимается: так «Канопа» показывает карту
 *                                     и оставляет её в колоде.
 */
export const SET_REVEAL = (partyState, action = {}) => {
  const op = action.op ?? 'open';
  if (op === 'open') return openReveal(partyState, action);
  if (op === 'discard') return discardReveal(partyState, action);
  if (op === 'bottom') return bottomReveal(partyState, action);
  throw new Error(`SET_REVEAL: op "${op}" (нужны open | discard | bottom)`);
};

const openReveal = (partyState, action) => {
  if (!partyState.combat) {
    throw new Error('SET_REVEAL: раскрывать карты можно только в битве');
  }

  const player = findPlayer(partyState, deckOwnerId(partyState, action));
  if (!player) {
    throw new Error(`SET_REVEAL: игрок ${action.of ?? action.playerId} не найден`);
  }
  if (revealOf(partyState, player.id)) {
    throw new Error(`SET_REVEAL: колода игрока ${player.id} уже раскрыта`);
  }

  const count = Math.max(1, Number(action.count ?? 1));
  const deck = zoneCards(player.deck);
  // пустая колода — не ошибка: раскрывать нечего, снимок выйдет пустым (золотое правило)
  const top = deck.slice(Math.max(0, deck.length - count));

  partyState.reveal = [
    ...(partyState.reveal ?? []),
    {
      playerId: String(player.id),
      source: action.source == null ? null : String(action.source),
      cards: top.map(card => ({
        cardId: cardKey(card),
        name: card.title ?? card.name ?? String(card.id),
        value: Number(card.value) || 0,
        bonus: Number(card.bonus) || 0,
      })),
    },
  ];
  return partyState;
};

/** Раскрытые карты уходят в сброс владельца: соперник лишается их, снимок снимается. */
const discardReveal = (partyState, action) => {
  const ownerId = deckOwnerId(partyState, action);
  const reveal = revealOf(partyState, ownerId);
  if (!reveal) throw new Error(`SET_REVEAL: колода игрока ${ownerId} не раскрыта`);

  const player = findPlayer(partyState, reveal.playerId);
  if (!player) throw new Error(`SET_REVEAL: игрок ${reveal.playerId} не найден`);

  const deck = zoneCards(player.deck);
  const taken = [];
  for (const entry of reveal.cards ?? []) {
    const index = deck.findIndex(card => cardKey(card) === String(entry.cardId));
    // раскрытой карты уже нет в колоде — сбрасывать нечего: свойство выполняется, чем может
    if (index >= 0) taken.push(...deck.splice(index, 1));
  }
  setZoneCards(player, 'deck', deck);

  if (taken.length > 0) {
    const discard = zoneCards(player.discard);
    discard.push(...taken);
    setZoneCards(player, 'discard', discard);
  }

  const rest = (partyState.reveal ?? []).filter(
    entry => String(entry.playerId) !== String(reveal.playerId),
  );
  partyState.reveal = rest.length > 0 ? rest : null;
  return partyState;
};

/** Раскрытые карты уходят под низ колоды владельца: карты вернутся в игру позже, снимок снимается. */
const bottomReveal = (partyState, action) => {
  const ownerId = deckOwnerId(partyState, action);
  const reveal = revealOf(partyState, ownerId);
  if (!reveal) throw new Error(`SET_REVEAL: колода игрока ${ownerId} не раскрыта`);

  const player = findPlayer(partyState, reveal.playerId);
  if (!player) throw new Error(`SET_REVEAL: игрок ${reveal.playerId} не найден`);

  const deck = zoneCards(player.deck);
  const moved = [];
  for (const entry of reveal.cards ?? []) {
    const index = deck.findIndex(card => cardKey(card) === String(entry.cardId));
    if (index >= 0) moved.push(...deck.splice(index, 1));
  }
  // низ колоды — начало массива (верх — конец): карта вернётся не скоро
  setZoneCards(player, 'deck', [...moved, ...deck]);

  const rest = (partyState.reveal ?? []).filter(
    entry => String(entry.playerId) !== String(reveal.playerId),
  );
  partyState.reveal = rest.length > 0 ? rest : null;
  return partyState;
};

export default SET_REVEAL;
