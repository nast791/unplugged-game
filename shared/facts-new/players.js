import { isPlayerAlive, isTeamFormat } from '#shared/helpers/base.js';

const sortedPlayers = state =>
  [...(state.players ?? [])].sort(
    (left, right) => Number(left.order ?? 0) - Number(right.order ?? 0),
  );

/** Список игроков по фильтру (side, alive). */
export const queryPlayers = (state, params = {}, { ownerPlayerId } = {}) => {
  const side = params.side ?? 'any';
  const aliveOnly = params.alive === true;

  const out = [];
  for (const player of sortedPlayers(state)) {
    const isOwner =
      ownerPlayerId != null && String(player.id) === String(ownerPlayerId);
    if (side === 'opponent' && isOwner) continue;
    if (side === 'self' && !isOwner) continue;
    if (aliveOnly && !isPlayerAlive(state, player)) continue;
    out.push({
      playerId: String(player.id),
      order: player.order,
      team: player.team,
      name: player.name,
    });
  }
  return out;
};

/**
 * PLAYERS — игроки по фильтру.
 * params: { alive?: true, side?: 'any'|'self'|'opponent', min?: number }
 */
export const PLAYERS = (ctx, params = {}) => {
  const ownerPlayerId = ctx.player?.id ?? ctx.state?.turn?.playerId;
  const list = queryPlayers(ctx.state, params, { ownerPlayerId });
  const min = params.min ?? 0;
  return { ok: list.length >= min, value: list };
};

/**
 * NEXT_PLAYER — следующий живой игрок по order (цикл).
 * turn.playerId == null — первый по order; иначе следующий, мёртвых пропускаем.
 */
export const NEXT_PLAYER = (ctx, _params = {}) => {
  const state = ctx.state;
  const allPlayers = sortedPlayers(state);
  if (allPlayers.length === 0) {
    return { ok: false, value: null };
  }

  const currentId = state.turn?.playerId;
  const startIndex =
    currentId == null
      ? -1
      : allPlayers.findIndex(player => String(player.id) === String(currentId));

  for (let step = 1; step <= allPlayers.length; step += 1) {
    const player = allPlayers[(startIndex + step) % allPlayers.length];
    if (isPlayerAlive(state, player)) {
      return { ok: true, value: String(player.id) };
    }
  }

  return { ok: false, value: null };
};

/** Число живых команд (для teams_2v2) или игроков (FFA). */
export const aliveSideCount = state => {
  const alive = queryPlayers(state, { alive: true }, {});
  if (!isTeamFormat(state)) return alive.length;
  return new Set(alive.map(entry => entry.team)).size;
};
