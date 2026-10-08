import { findPlayer, zoneCards } from '#shared/helpers/base.js';
import { cardHasTag } from '#shared/helpers/cards.js';

/**
 * Осколки Снежной королевы: источник правды — **сброс** (`docs/heroes/snow-queen/passport.md` §3, §5).
 * Сколько карт с меткой `shard` лежит в сбросе, столько у неё осколков.
 *
 * Предмет `shard` — только табло для игрока: движок выставляет собранные копии в состояние `collected`,
 * остальные держит в `ice` и прячет их в проекции. Счёт всегда считается по сбросу, поэтому иконки
 * не могут «разъехаться» с ним: расходится максимум картинка до ближайшей синхронизации.
 */
export const SHARD_GROUP = 'shard';
export const SHARD_TAG = 'shard';
export const SHARD_STATE_FREE = 'ice';
export const SHARD_STATE_COLLECTED = 'collected';

/** Осколки игрока по сбросу. */
export const shardCount = (state, playerId) =>
  zoneCards(findPlayer(state, playerId)?.discard).filter(card => cardHasTag(card, SHARD_TAG))
    .length;

/** Сколько копий предмета несёт пак героя (сколько осколков вообще бывает). */
export const shardPoolSize = (state, playerId) =>
  (findPlayer(state, playerId)?.items ?? []).filter(item => String(item.group) === SHARD_GROUP)
    .length;

/** Выставить табло по счёту: `count` копий в `collected`, остальные — в `ice`. */
export const syncShardItems = (state, playerId) => {
  const player = findPlayer(state, playerId);
  const items = (player?.items ?? []).filter(item => String(item.group) === SHARD_GROUP);
  if (!player || items.length === 0) return state;

  const wanted = Math.min(shardCount(state, playerId), items.length);
  items.forEach((item, index) => {
    item.state = index < wanted ? SHARD_STATE_COLLECTED : SHARD_STATE_FREE;
  });
  return state;
};

/** Синхронизировать табло у всех, у кого есть осколки: вызывается на выходе действия и при проекции. */
export const syncAllShardItems = state => {
  for (const player of state?.players ?? []) {
    if ((player.items ?? []).some(item => String(item.group) === SHARD_GROUP)) {
      syncShardItems(state, player.id);
    }
  }
  return state;
};

export default syncShardItems;
