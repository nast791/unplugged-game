import { bfsDistance } from '#shared/helpers/board.js';
import { findFighter, findPlayer, isTeamFormat } from '#shared/helpers/base.js';
import { cellAreaIds, sharesArea } from '#shared/helpers/placement.js';

const sortedPlayers = state =>
  [...(state.players ?? [])].sort(
    (left, right) => Number(left.order ?? 0) - Number(right.order ?? 0),
  );

/** Роль игрока относительно владельца: any | self | opponent | teammate. */
const sideMatches = (state, side, ownerId, player) => {
  if (side === 'any') return true;

  const isOwner = ownerId != null && String(player.id) === ownerId;
  if (side === 'self') return isOwner;

  const owner = isOwner ? player : findPlayer(state, ownerId);
  const sameTeam =
    isTeamFormat(state) &&
    owner?.team != null &&
    player.team != null &&
    String(owner.team) === String(player.team);

  if (side === 'teammate') return !isOwner && sameTeam;
  if (side === 'opponent') return !isOwner && !sameTeam;
  return true;
};

/**
 * Бойцы на поле по фильтру.
 * params: { side, type, group, fighterIds, alive, placed, areaOf, reachableTo }
 * group — помощники одного вида (у трёх Гарпий id `harpies_1..3`, группа `harpies`);
 * fighterIds — конкретные бойцы (например, «мой боец из этого боя ещё на поле»);
 * areaOf — в одной области с указанным бойцом (многоцветная клетка считается во всех своих зонах);
 * reachableTo — кто дотягивается до него своей attackRange.
 */
export const queryFighters = (state, params = {}, { ownerPlayerId } = {}) => {
  const ownerId = ownerPlayerId == null ? null : String(ownerPlayerId);
  const side = params.side ?? 'any';
  const aliveOnly = params.alive !== false;
  const placedOnly = params.placed !== false;
  const nodes = state.map?.nodes ?? [];

  let areaCellId = null;
  if (params.areaOf != null) {
    const { fighter } = findFighter(state, params.areaOf);
    if (!fighter || fighter.currentPosition == null) return [];
    areaCellId = fighter.currentPosition;
    if (cellAreaIds(state, areaCellId).length === 0) return [];
  }

  let reference = null;
  if (params.reachableTo != null) {
    reference = findFighter(state, params.reachableTo).fighter;
    if (!reference || reference.currentPosition == null) return [];
  }

  const out = [];
  for (const player of sortedPlayers(state)) {
    if (!sideMatches(state, side, ownerId, player)) continue;

    for (const fighter of player.fighters ?? []) {
      if (placedOnly && fighter.currentPosition == null) continue;
      if (aliveOnly && Number(fighter.currentHp) <= 0) continue;
      if (params.type != null && fighter.type !== params.type) continue;
      if (
        params.group != null &&
        String(fighter.group ?? '') !== String(params.group)
      ) {
        continue;
      }
      if (
        params.fighterIds != null &&
        !(Array.isArray(params.fighterIds) ? params.fighterIds : [params.fighterIds])
          .map(String)
          .includes(String(fighter.id))
      ) {
        continue;
      }
      if (
        areaCellId != null &&
        !sharesArea(state, areaCellId, fighter.currentPosition)
      ) {
        continue;
      }
      if (reference) {
        const range = Number(fighter.attackRange ?? 1);
        const distance = bfsDistance(
          nodes,
          fighter.currentPosition,
          reference.currentPosition,
          range,
        );
        if (distance > range) continue;
      }

      out.push({
        fighterId: String(fighter.id),
        playerId: String(player.id),
        name: fighter.name || fighter.id,
        type: fighter.type,
        position: fighter.currentPosition,
      });
    }
  }

  return out;
};

/** FIGHTERS — бойцы по фильтру; params.min — минимальный размер списка. */
export const FIGHTERS = (ctx, params = {}) => {
  const ownerPlayerId = ctx.player?.id ?? ctx.state?.turn?.playerId;
  const list = queryFighters(ctx.state, params, { ownerPlayerId });
  const min = params.min ?? 0;
  return { ok: list.length >= min, value: list };
};

export default FIGHTERS;
