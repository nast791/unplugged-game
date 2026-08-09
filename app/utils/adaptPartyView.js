const zoneCards = zone => {
  if (!zone) return [];
  if (Array.isArray(zone.cards)) return zone.cards.map(c => ({ ...c }));
  return [];
};

const zoneCount = zone =>
  zone?.count ?? (Array.isArray(zone?.cards) ? zone.cards.length : 0);

/** Host view → формат useGameHelpers (phase, currentPlayer, hand[]). */
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
    players: (raw.players ?? []).map(p => ({
      ...p,
      hand: zoneCards(p.hand),
      deck: zoneCards(p.deck),
      discard: zoneCards(p.discard),
      handCount: zoneCount(p.hand),
      deckCount: zoneCount(p.deck),
      discardCount: zoneCount(p.discard),
    })),
  };
};
