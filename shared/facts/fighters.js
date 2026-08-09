import { areaIdAtCell, findFighter } from '#shared/helpers.js';

/**
 * Универсальный запрос бойцов.
 * params: { side?: 'opponent'|'self'|'any', areaOf?: fighterId }
 */
export const queryFighters = (state, params = {}, { ownerPlayerId } = {}) => {
  const side = params.side ?? 'any';
  let areaId = null;

  if (params.areaOf != null) {
    const { fighter } = findFighter(state, params.areaOf);
    if (!fighter?.currentPosition) return [];
    areaId = areaIdAtCell(state, fighter.currentPosition);
    if (areaId == null) return [];
  }

  const out = [];
  for (const player of state.players ?? []) {
    const isOwner = String(player.id) === String(ownerPlayerId);
    if (side === 'opponent' && isOwner) continue;
    if (side === 'self' && !isOwner) continue;

    for (const fighter of player.fighters ?? []) {
      if (fighter.currentPosition == null) continue;
      if (Number(fighter.currentHp) <= 0) continue;
      if (areaId != null && areaIdAtCell(state, fighter.currentPosition) !== areaId) {
        continue;
      }
      out.push({
        fighterId: String(fighter.id),
        playerId: String(player.id),
        name: fighter.name || fighter.id,
        position: fighter.currentPosition,
      });
    }
  }
  return out;
};

/**
 * FIGHTERS — список бойцов по фильтру.
 * min / as задаются на дескрипторе триггера в evaluateTriggers.
 */
export const FIGHTERS = (ctx, params = {}) => {
  const list = queryFighters(ctx.state, params, {
    ownerPlayerId: ctx.player?.id ?? ctx.state?.turn?.playerId,
  });
  return { ok: true, value: list };
};

export default FIGHTERS;
