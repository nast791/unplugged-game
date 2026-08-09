/** Универсальные helpers для hooks, phases, actions. Боец — hero или assistant в player.fighters. */

export const seatIndex = (partyState, playerId) => {
  const player = partyState.players?.find(
    entry => String(entry.id) === String(playerId),
  );
  if (!player) return -1;
  if (Number.isInteger(player.order)) return player.order - 1;
  return partyState.players.findIndex(
    entry => String(entry.id) === String(playerId),
  );
};

export const findPlayer = (partyState, playerId) =>
  partyState.players?.find(entry => String(entry.id) === String(playerId)) ??
  null;

export const findOwnedFighter = (partyState, playerId, fighterId) => {
  const player = findPlayer(partyState, playerId);
  if (!player || !Array.isArray(player.fighters)) {
    return { player: null, fighter: null, index: -1 };
  }
  const index = player.fighters.findIndex(
    entry => String(entry.id) === String(fighterId),
  );
  if (index < 0) return { player, fighter: null, index: -1 };
  return { player, fighter: player.fighters[index], index };
};

export const playerHeroes = player =>
  (player?.fighters ?? []).filter(fighter => fighter.type === 'hero');

/** Первый hint с active === true (порядок ключей = приоритет). */
export const resolvePhaseHint = (hints, partyState, playerId, clientContext = {}) => {
  for (const entry of Object.values(hints ?? {})) {
    if (entry.active(partyState, playerId, clientContext)) {
      return entry.text();
    }
  }
  return null;
};

/** OK / Back из phase.ok / phase.back — для phase.ui(), не для core. */
export const resolveOkBackControls = (phase, partyState, playerId) => ({
  ok: {
    visible: true,
    enabled: phase?.ok?.enabled?.(partyState, playerId) ?? false,
  },
  back: {
    visible: phase?.back?.visible?.(partyState, playerId) ?? false,
    enabled: phase?.back?.enabled?.(partyState, playerId) ?? false,
  },
});

export const occupiedOwnCellIds = (player, exceptFighterId) => {
  const blocked = new Set();
  for (const fighter of player?.fighters ?? []) {
    if (fighter.currentPosition == null) continue;
    if (
      exceptFighterId != null &&
      String(fighter.id) === String(exceptFighterId)
    ) {
      continue;
    }
    blocked.add(String(fighter.currentPosition));
  }
  return blocked;
};
