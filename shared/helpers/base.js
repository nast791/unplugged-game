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

/** Живые бойцы игрока; type — 'hero' | 'assistant' или любой, если не задан. */
export const livingFighters = (player, { type } = {}) =>
  (player?.fighters ?? []).filter(fighter => {
    if (Number(fighter.currentHp) <= 0) return false;
    if (type != null && fighter.type !== type) return false;
    return true;
  });

const teammates = (partyState, player) =>
  (partyState.players ?? []).filter(
    entry =>
      entry.team === player.team && String(entry.id) !== String(player.id),
  );

export const isTeamFormat = partyState =>
  partyState.settings?.format === 'teams_2v2';

/**
 * Игрок жив для хода / победы.
 * FFA: жив, пока жив его герой.
 * Команда: в team нужен ≥1 живой герой, иначе все мёртвы; свой герой;
 * или (мёртвый герой) свои живые помощники при живом герое союзника.
 * Без героя и без помощников игрок выбывает, даже если союзник с героем жив.
 */
export const isPlayerAlive = (partyState, player) => {
  if (!player) return false;
  if (livingFighters(player, { type: 'hero' }).length > 0) return true;
  if (!isTeamFormat(partyState)) return false;

  const allyHasLivingHero = teammates(partyState, player).some(
    ally => livingFighters(ally, { type: 'hero' }).length > 0,
  );
  if (!allyHasLivingHero) return false;

  return livingFighters(player, { type: 'assistant' }).length > 0;
};

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
