/** Универсальные helpers для hooks, phases, actions. Боец — hero или assistant в player.fighters. */
import { cardKey } from '#shared/helpers/cards.js';

export const seatIndex = (partyState, playerId) => {
  const player = partyState.players?.find(entry => String(entry.id) === String(playerId));
  if (!player) return -1;
  if (Number.isInteger(player.order)) return player.order - 1;
  return partyState.players.findIndex(entry => String(entry.id) === String(playerId));
};

export const findPlayer = (partyState, playerId) =>
  partyState.players?.find(entry => String(entry.id) === String(playerId)) ?? null;

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

export const findCardInHand = (player, cardId) => findCardInZone(player?.hand, cardId);

/**
 * id бойца из значения факта: строка, один элемент списка или объект `FIGHTERS` (`{ fighterId }`).
 * Факты отдают списки объектов, а `areaOf`/`adjacentTo` ждут одного бойца: без разбора
 * `CELLS { areaOf: '$heroes' }` молча получал `[object Object]` и не находил никого.
 */
const fighterRef = value => {
  if (value == null) return null;
  const entry = Array.isArray(value) ? value[0] : value;
  if (entry == null) return null;
  if (typeof entry === 'object') return entry.fighterId ?? entry.id ?? null;
  return entry;
};

/** Боец на поле у любого игрока (id бойца, элемент списка факта или объект `FIGHTERS`). */
export const findFighter = (partyState, fighterId) => {
  const ref = fighterRef(fighterId);
  if (ref == null) return { player: null, fighter: null, index: -1 };
  for (const player of partyState.players ?? []) {
    const index = (player.fighters ?? []).findIndex(entry => String(entry.id) === String(ref));
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
  const index = player.fighters.findIndex(entry => String(entry.id) === String(fighterId));
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
    entry => entry.team === player.team && String(entry.id) !== String(player.id),
  );

export const isTeamFormat = partyState => partyState.settings?.format === 'teams_2v2';

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

/**
 * Враг ли игрок владельцу — та же роль, что у факта `FIGHTERS { side: 'opponent' }` и у боя
 * (`shared/helpers/combat.js`). Союзник — тот, у кого та же команда; там, где команд нет,
 * враг любой другой игрок.
 */
export const isEnemyPlayer = (partyState, playerId, other) => {
  if (other == null || String(other.id) === String(playerId)) return false;
  const owner = findPlayer(partyState, playerId);
  if (owner?.team != null && other.team != null && String(owner.team) === String(other.team)) {
    return false;
  }
  return true;
};

/** Роли, которые можно писать в параметре «чей это игрок», вместо id. */
const PLAYER_ROLES = ['self', 'opponent', 'enemy'];

/**
 * Игрок по ссылке действия: id, `'self'` | `'opponent'` | `'enemy'`.
 *
 * Роль нужна правилам момента `picked`: переменные условий (`var: 'enemy'`) в другое правило
 * не переносятся — правила независимы, — поэтому «противник» называют ролью, а не `$enemy`.
 * Сторону берём из открытого боя (в нём у каждой стороны ровно один противник), а вне боя —
 * ходящего игрока: в FFA другой противник неразличим, и роль отвечает на «тот, кто напротив».
 * Незнакомая строка возвращается как есть: это id игрока.
 */
export const playerByRole = (partyState, actingPlayerId, ref) => {
  if (ref == null || Array.isArray(ref)) return ref;
  const key = String(ref);
  if (!PLAYER_ROLES.includes(key)) return ref;
  if (key !== 'self' && actingPlayerId == null) return ref;

  const selfId = actingPlayerId == null ? partyState.turn?.playerId : actingPlayerId;
  if (key === 'self') return selfId;

  const combat = partyState.combat ?? null;
  if (combat != null) {
    if (String(combat.attackerPlayerId) === String(selfId)) return combat.defenderPlayerId;
    if (String(combat.defenderPlayerId) === String(selfId)) return combat.attackerPlayerId;
  }

  const other = (partyState.players ?? []).find(entry => isEnemyPlayer(partyState, selfId, entry));
  return other?.id ?? ref;
};

export const occupiedOwnCellIds = (player, exceptFighterId) => {
  const blocked = new Set();
  for (const fighter of player?.fighters ?? []) {
    if (fighter.currentPosition == null) continue;
    if (exceptFighterId != null && String(fighter.id) === String(exceptFighterId)) {
      continue;
    }
    blocked.add(String(fighter.currentPosition));
  }
  return blocked;
};
