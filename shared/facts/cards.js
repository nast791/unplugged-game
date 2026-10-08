import { findPlayer, zoneCards } from '#shared/helpers/base.js';
import { cardHasTag, cardKey } from '#shared/helpers/cards.js';

const ZONES = ['deck', 'hand', 'discard'];

const contextPlayerId = ctx => ctx.playerId ?? ctx.player?.id ?? ctx.state?.turn?.playerId;

/**
 * CARDS — карты игрока в зоне по фильтру. Отвечает на вопросы вида «сколько карт с меткой `shard`
 * лежит в сбросе» — на этом стоит вся механика осколков Снежной королевы.
 * params: { of, zone, tag, type, min, max }
 * `of` — чей сброс/колода/рука (по умолчанию своя); `zone` — `discard` (по умолчанию), `deck`, `hand`;
 * `tag` — метка карты (её заводит пак героя, `shared/helpers/cards.js`), `type` — тип карты;
 * `min`/`max` считают число подходящих карт, `value` — всегда список карт.
 * Элемент списка годится прямо в `candidates` окна `kind: 'options'`: `optionId` — ключ копии
 * (им же карта уходит в сброс через `SET_CARDS { cardIds }`), `title` — название, `bonus` — усиление.
 * Так карта вида «посмотрите руку противника и выберите карту» открывает окно по чужой руке.
 */
export const CARDS = (ctx, params = {}) => {
  const playerId = params.of ?? contextPlayerId(ctx);
  const player = findPlayer(ctx.state, playerId);
  const zoneName = params.zone == null ? 'discard' : String(params.zone);
  if (!player || !ZONES.includes(zoneName)) return { ok: false, value: [] };

  const cards = zoneCards(player[zoneName]).filter(card => cardHasTag(card, params.tag));
  const filtered =
    params.type == null ? cards : cards.filter(card => card?.type === String(params.type));

  const min = params.min ?? 0;
  const max = params.max == null ? Infinity : Number(params.max);

  return {
    ok: filtered.length >= Number(min) && filtered.length <= max,
    value: filtered.map(card => ({
      cardId: cardKey(card),
      optionId: cardKey(card),
      id: card?.id,
      title: card?.title ?? null,
      type: card?.type,
      bonus: Number(card?.bonus) || 0,
      tags: Array.isArray(card?.tags) ? [...card.tags] : [],
    })),
  };
};

export default CARDS;
