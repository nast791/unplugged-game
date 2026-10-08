import { bfsDistance } from '#shared/helpers/board.js';
import { findFighter, findPlayer, isTeamFormat } from '#shared/helpers/base.js';
import { cellTerrain, cellTerrains, sharesArea } from '#shared/helpers/placement.js';

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
 * params: { side, of, type, group, fighterIds, alive, placed, areaOf, terrain, reachableTo, adjacentTo,
 *           movedThisTurn, frozen }
 * side: 'any' — все, 'self' — свои, 'opponent' — бойцы ВСЕХ врагов (в команде — всех чужих команд),
 * 'teammate' — союзники без себя;
 * of — бойцы одного игрока (id), например противника в этой битве: `COMBAT { player: 'opponent' }` → `of: '$enemy'`;
 * group — помощники одного вида (у трёх Гарпий id `harpies_1..3`, группа `harpies`);
 * fighterIds — конкретные бойцы (например, «мой боец из этого боя ещё на поле»);
 * areaOf — в одной области с указанным бойцом (область = стихия клетки, `docs/terrain.md`);
 * terrain — бойцы, стоящие на клетке с этой стихией (двухцветная клетка считается в обеих);
 * reachableTo — кто дотягивается до него своей attackRange;
 * adjacentTo — кто стоит ровно на соседней с ним клетке (своя клетка не считается);
 * movedThisTurn — двигался ли боец в этом ходу; frozen — стоит ли на нём статус «заморожен».
 */
export const queryFighters = (state, params = {}, { ownerPlayerId } = {}) => {
  const ownerId = ownerPlayerId == null ? null : String(ownerPlayerId);
  const side = params.of == null ? (params.side ?? 'any') : 'of';
  const onlyPlayerId = params.of == null ? null : String(params.of);
  const aliveOnly = params.alive !== false;
  const placedOnly = params.placed !== false;
  const nodes = state.map?.nodes ?? [];

  let areaCellId = null;
  if (params.areaOf != null) {
    const { fighter } = findFighter(state, params.areaOf);
    if (!fighter || fighter.currentPosition == null) return [];
    areaCellId = fighter.currentPosition;
    if (cellTerrains(state, areaCellId).length === 0) return [];
  }

  const terrain = params.terrain == null ? null : String(params.terrain);

  let reference = null;
  if (params.reachableTo != null) {
    reference = findFighter(state, params.reachableTo).fighter;
    if (!reference || reference.currentPosition == null) return [];
  }

  let adjacentCell = null;
  if (params.adjacentTo != null) {
    const { fighter } = findFighter(state, params.adjacentTo);
    if (!fighter || fighter.currentPosition == null) return [];
    adjacentCell = fighter.currentPosition;
  }

  const out = [];
  for (const player of sortedPlayers(state)) {
    if (onlyPlayerId != null) {
      if (String(player.id) !== onlyPlayerId) continue;
    } else if (!sideMatches(state, side, ownerId, player)) {
      continue;
    }

    for (const fighter of player.fighters ?? []) {
      if (placedOnly && fighter.currentPosition == null) continue;
      if (aliveOnly && Number(fighter.currentHp) <= 0) continue;
      if (params.type != null && fighter.type !== params.type) continue;
      if (params.group != null && String(fighter.group ?? '') !== String(params.group)) {
        continue;
      }
      // «двигался в этом ходу» — флаг бойца (ставит SET_FIGHTER_CELL, снимает начало хода)
      if (params.movedThisTurn != null && Boolean(fighter.movedThisTurn) !== params.movedThisTurn) {
        continue;
      }
      // «заморожен» — статус бойца (ставит SET_STATUS, снимает конец хода)
      if (params.frozen != null && Boolean(fighter.frozen) !== params.frozen) {
        continue;
      }
      if (
        params.fighterIds != null &&
        !(Array.isArray(params.fighterIds) ? params.fighterIds : [params.fighterIds])
          // значение приходит и строкой, и объектом факта (`FIGHTERS` → `{ fighterId }`)
          .map(entry =>
            entry != null && typeof entry === 'object' ? (entry.fighterId ?? entry.id) : entry,
          )
          .map(String)
          .includes(String(fighter.id))
      ) {
        continue;
      }
      if (terrain != null && !cellTerrains(state, fighter.currentPosition).includes(terrain)) {
        continue;
      }
      if (areaCellId != null && !sharesArea(state, areaCellId, fighter.currentPosition)) {
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
      if (adjacentCell != null) {
        const distance = bfsDistance(nodes, fighter.currentPosition, adjacentCell, 1);
        if (distance === 0 || distance > 1) continue;
      }

      out.push({
        fighterId: String(fighter.id),
        playerId: String(player.id),
        name: fighter.name || fighter.id,
        type: fighter.type,
        position: fighter.currentPosition,
        terrain: cellTerrain(state, fighter.currentPosition),
      });
    }
  }

  return out;
};

/** FIGHTERS — бойцы по фильтру; params.min — минимальный размер списка, params.max — максимальный. */
export const FIGHTERS = (ctx, params = {}) => {
  const ownerPlayerId = ctx.player?.id ?? ctx.state?.turn?.playerId;
  const list = queryFighters(ctx.state, params, { ownerPlayerId });
  const min = params.min ?? 0;
  const max = params.max == null ? Infinity : Number(params.max);
  return { ok: list.length >= min && list.length <= max, value: list };
};

export default FIGHTERS;
