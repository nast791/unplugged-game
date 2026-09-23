/** Универсальные helpers для hooks, phases, actions. Боец — hero или assistant в player.fighters. */
import { cardKey } from '#shared/helpers/cards.js';

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

/** Карты зоны — и массив, и { visibility, cards }. */
export const zoneCards = zone => {
  if (Array.isArray(zone)) return zone;
  return zone?.cards ?? [];
};

/** Записать карты в зону, сохранив форму (массив или { visibility, cards }). */
export const setZoneCards = (player, name, cards) => {
  const zone = player[name];
  player[name] = Array.isArray(zone) ? cards : { ...(zone ?? {}), cards };
  return cards;
};

/** Есть ли что добирать: колода или сброс не пусты. */
export const canDraw = player =>
  zoneCards(player?.deck).length > 0 || zoneCards(player?.discard).length > 0;

/** Карта в зоне по instanceId или id. */
export const findCardInZone = (zone, cardId) => {
  const cards = zoneCards(zone);
  const index = cards.findIndex(card => cardKey(card) === String(cardId));
  return index < 0 ? null : cards[index];
};

/** Забрать карту из зоны; null — если её там нет. */
export const takeCardFromZone = (zone, cardId) => {
  const cards = zoneCards(zone);
  const index = cards.findIndex(card => cardKey(card) === String(cardId));
  if (index < 0) return null;
  return cards.splice(index, 1)[0];
};

export const findCardInHand = (player, cardId) =>
  findCardInZone(player?.hand, cardId);

/** Боец на поле у любого игрока. */
export const findFighter = (partyState, fighterId) => {
  if (fighterId == null) return { player: null, fighter: null, index: -1 };
  for (const player of partyState.players ?? []) {
    const index = (player.fighters ?? []).findIndex(
      entry => String(entry.id) === String(fighterId),
    );
    if (index >= 0) {
      return { player, fighter: player.fighters[index], index };
    }
  }
  return { player: null, fighter: null, index: -1 };
};

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
  if (player.resigned) return false;
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
      return entry.text(partyState, playerId, clientContext);
    }
  }
  return null;
};

/** OK / Back из phase.ok / phase.back — для phase.ui(), не для core. */
export const resolveOkBackControls = (phase, partyState, playerId) => ({
  ok: {
    visible: true,
    enabled: phase?.ok?.enabled?.(partyState, playerId) ?? false,
    label: phase?.ok?.label ?? null,
  },
  back: {
    visible: phase?.back?.visible?.(partyState, playerId) ?? false,
    enabled: phase?.back?.enabled?.(partyState, playerId) ?? false,
    label: phase?.back?.label ?? null,
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
