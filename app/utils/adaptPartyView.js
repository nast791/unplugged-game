/** Карты зоны: сервер прячет чужую зону целиком, поэтому список может быть пустым. */
const zoneCards = zone => (Array.isArray(zone?.cards) ? zone.cards.map(card => ({ ...card })) : []);

/** Сколько карт в зоне: сервер отдаёт либо список карт, либо только счётчик (закрытая колода). */
const zoneCount = zone => zone?.count ?? (Array.isArray(zone?.cards) ? zone.cards.length : 0);

/**
 * Проекция сервера → формат клиента: хук как `phase`, объект `turn` как числа, зоны как массивы карт.
 * Из зон клиент читает свою руку, свой сброс (он открыт всем ролям — `shared/constants/deck.js`) и число
 * карт в колоде; карты закрытой колоды в view не переносятся — иначе лежали бы в состоянии клиента зря.
 */
export const adaptPartyView = raw => {
  if (!raw) return null;

  const turnObj = raw.turn && typeof raw.turn === 'object' ? raw.turn : null;

  return {
    ...raw,
    phase: raw.hook ?? raw.phase ?? null,
    currentPlayer: turnObj?.playerId ?? raw.currentPlayer ?? null,
    turn: turnObj?.index ?? (typeof raw.turn === 'number' ? raw.turn : 0),
    actionsLeft: turnObj?.actionsLeft ?? raw.actionsLeft ?? 0,
    winner: raw.winner ?? null,
    players: (raw.players ?? []).map(({ deck, discard, hand, ...p }) => ({
      ...p,
      hand: zoneCards(hand),
      discard: zoneCards(discard),
      deckCount: zoneCount(deck),
      discardCount: zoneCount(discard),
    })),
  };
};
