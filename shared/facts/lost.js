import { findPlayer } from '#shared/helpers/base.js';

/**
 * LOST — убитые бойцы игрока (они лежат в `player.lost`, пока их не вернёт воскрешение).
 * Нужно эффектам вида «воскресите убитую Гарпию»: если убитых нет, поднимать некого.
 * params: { group, type, min }
 * group — id бойца или группа помощников (у трёх Гарпий группа `harpies`);
 * type — 'hero' | 'assistant': «верните убитого помощника» отсекает героя.
 */
export const LOST = (ctx, params = {}) => {
  const playerId = ctx.playerId ?? ctx.player?.id ?? ctx.state?.turn?.playerId;
  const player = findPlayer(ctx.state, playerId);
  if (!player) return { ok: false, value: [] };

  const group = params.group;
  const type = params.type == null ? null : String(params.type);
  const list = (player.lost ?? [])
    .filter(fighter => type == null || String(fighter.type) === type)
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
