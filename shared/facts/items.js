import { findPlayer } from '#shared/helpers/base.js';

/**
 * ITEMS — предметы игрока. Предметы лежат копиями: у каждой свой id и общая группа,
 * `state` — состояние копии (его значения задаёт пак: у катушек 'inactive' | 'active').
 * params: { group?, state?, min?, max? }
 * value — список подходящих предметов; `min`/`max` проверяют «таких не меньше N / не больше N»
 * (например, «обе катушки активны»: ITEMS { group: 'coil', state: 'active', min: 2 };
 * «активна ровно одна»: min: 1, max: 1).
 */
export const ITEMS = (ctx, params = {}) => {
  const playerId = ctx.playerId ?? ctx.player?.id ?? ctx.state?.turn?.playerId;
  const player = findPlayer(ctx.state, playerId);
  if (!player) return { ok: false, value: [] };

  const list = (player.items ?? [])
    .filter(
      item =>
        params.group == null ||
        String(item.group) === String(params.group) ||
        String(item.id) === String(params.group),
    )
    .filter(item => params.state == null || String(item.state) === String(params.state))
    .map(item => ({
      itemId: String(item.id),
      group: item.group == null ? null : String(item.group),
      name: item.name ?? String(item.id),
      state: item.state == null ? null : String(item.state),
    }));

  const min = params.min ?? 0;
  const max = params.max == null ? Infinity : Number(params.max);
  return { ok: list.length >= Number(min) && list.length <= max, value: list };
};

export default ITEMS;
