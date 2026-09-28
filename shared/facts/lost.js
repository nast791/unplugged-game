import { findPlayer } from '#shared/helpers/base.js';

/**
 * LOST — убитые бойцы игрока (они лежат в `player.lost`, пока их не вернёт воскрешение).
 * Нужно эффектам вида «воскресите убитую Гарпию»: если убитых нет, поднимать некого.
 * params: { group, min }
 * group — id бойца или группа помощников (у трёх Гарпий группа `harpies`).
 */
export const LOST = (ctx, params = {}) => {
  const playerId = ctx.playerId ?? ctx.player?.id ?? ctx.state?.turn?.playerId;
  const player = findPlayer(ctx.state, playerId);
  if (!player) return { ok: false, value: [] };

  const group = params.group;
  const list = (player.lost ?? [])
    .filter(
      fighter =>
        group == null ||
        String(fighter.group) === String(group) ||
        String(fighter.id) === String(group),
    )
    .map(fighter => ({
      fighterId: String(fighter.id),
      name: fighter.name ?? fighter.id,
      group: fighter.group ?? null,
    }));

  const min = params.min ?? 0;
  return { ok: list.length >= min, value: list };
};

export default LOST;
