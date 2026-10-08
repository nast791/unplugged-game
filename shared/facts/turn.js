import { rules } from '#shared/constants/rules.js';
import { zoneCards } from '#shared/helpers/base.js';
import { cardHasTag } from '#shared/helpers/cards.js';
import {
  activePlayerId,
  handCards,
  handLimitFor,
  isMomentMine,
  momentOf,
  mustDiscardCount,
} from '#shared/helpers/turn.js';

/** Игрок из контекста факта: явный playerId важнее ctx.player, иначе — активный игрок хода. */
const contextPlayerId = ctx => ctx.playerId ?? ctx.player?.id ?? ctx.state?.turn?.playerId;

const cardView = card => ({
  cardId: String(card?.instanceId ?? card?.id),
  id: card?.id,
  type: card?.type,
  value: Number(card?.value) || 0,
  bonus: Number(card?.bonus) || 0,
  tags: Array.isArray(card?.tags) ? [...card.tags] : [],
});

/** ACTIVE_PLAYER — чей ход; params: { id } — проверить конкретного игрока. */
export const ACTIVE_PLAYER = (ctx, params = {}) => {
  const activeId = activePlayerId(ctx.state);
  const checkedId = params.id ?? ctx.playerId ?? ctx.player?.id ?? activeId;
  return {
    ok: activeId != null && checkedId != null && String(activeId) === String(checkedId),
    value: activeId == null ? null : String(activeId),
  };
};

/**
 * AP — действия в ходу. `min`/`max` считают остаток (по умолчанию min = 1), `spentMin`/`spentMax` —
 * сколько действий уже потрачено, то есть какое по счёту действие объявляют сейчас: свойство
 * «сыграна вторым действием хода» — это `spentMin: 1, spentMax: 1`. Счёт идёт от `actionsTotal`,
 * поэтому лишнее действие от умения («Пламя преисподней») сдвигает нумерацию, а не ломает её.
 */
export const AP = (ctx, params = {}) => {
  const turn = ctx.state?.turn ?? {};
  const left = Number(turn.actionsLeft) || 0;
  const total = Number(turn.actionsTotal) || 0;
  const spent = Math.max(0, total - left);

  const min = params.min ?? 1;
  const max = params.max == null ? Infinity : Number(params.max);
  const spentMin = params.spentMin == null ? null : Number(params.spentMin);
  const spentMax = params.spentMax == null ? null : Number(params.spentMax);

  return {
    ok:
      left >= min &&
      left <= max &&
      (spentMin == null || spent >= spentMin) &&
      (spentMax == null || spent <= spentMax),
    value: left,
  };
};

/**
 * IN_PROGRESS — идёт ли момент хода (movement | combat | targeting).
 * params: { has, mine } — mine: true (по умолчанию) значит «момент мой».
 */
export const IN_PROGRESS = (ctx, params = {}) => {
  const names = params.has == null ? ['movement', 'combat', 'targeting'] : [params.has];
  const mine = params.mine !== false;
  const playerId = contextPlayerId(ctx);

  for (const name of names) {
    const moment = momentOf(ctx.state, name);
    if (!moment) continue;
    if (mine && !isMomentMine(ctx.state, playerId, name)) continue;
    return { ok: true, value: { name, moment } };
  }

  return { ok: false, value: null };
};

/** TARGETING — открыт ли выбор цели; params: { mine } (по умолчанию true — мой выбор). */
export const TARGETING = (ctx, params = {}) => {
  const targeting = ctx.state?.targeting ?? null;
  if (!targeting) return { ok: false, value: null };

  if (params.mine !== false) {
    const playerId = contextPlayerId(ctx);
    if (playerId == null || String(targeting.playerId) !== String(playerId)) {
      return { ok: false, value: null };
    }
  }

  return { ok: true, value: targeting };
};

/**
 * DECK — колода игрока: сколько карт осталось; params: { of, min, max }.
 * Нужна картам, которые платят топливом из колоды («сбросьте верхнюю карту»): на пустой колоде цена
 * не платится, и свойство не должно срабатывать. `of` — чья колода, по умолчанию своя.
 */
export const DECK = (ctx, params = {}) => {
  const playerId = params.of ?? contextPlayerId(ctx);
  const player = (ctx.state?.players ?? []).find(entry => String(entry.id) === String(playerId));
  const cards = zoneCards(player?.deck);
  const min = params.min ?? 0;
  const max = params.max == null ? Infinity : Number(params.max);

  return { ok: cards.length >= min && cards.length <= max, value: cards.length };
};

/**
 * HAND — карты руки; params: { of, type, tag, min, max, bonusMin }.
 * `of` — чья рука (id игрока), по умолчанию своя: эффекты вроде «враг сбрасывает карту» смотрят чужую руку.
 * `min`/`max` считают число подходящих карт: «в руке противника нет карт» — это `max: 0`.
 * bonusMin отсекает карты со слишком маленьким бонусом (например, «есть чем усилить атаку»),
 * tag — только карты с меткой («сбросьте карту с осколком», см. `shared/helpers/cards.js`).
 */
export const HAND = (ctx, params = {}) => {
  const ownerPlayerId = params.of ?? contextPlayerId(ctx);
  const cards = handCards(ctx.state, ownerPlayerId)
    .filter(card => params.type == null || card?.type === params.type)
    .filter(card => cardHasTag(card, params.tag))
    .filter(
      card => params.bonusMin == null || (Number(card?.bonus) || 0) >= Number(params.bonusMin),
    );
  const min = params.min == null ? 0 : Number(params.min);
  const max = params.max == null ? Infinity : Number(params.max);
  return {
    ok: cards.length >= min && cards.length <= max,
    value: cards.map(cardView),
  };
};

/** HAND_OVER_LIMIT — рука сверх лимита; params: { max }. Лимит по умолчанию — персональный (умения героев). */
export const HAND_OVER_LIMIT = (ctx, params = {}) => {
  const playerId = contextPlayerId(ctx);
  const size = handCards(ctx.state, playerId).length;
  const max = Number(params.max ?? handLimitFor(ctx.state, playerId));
  return {
    ok: size > max,
    value: { size, max, mustDiscard: mustDiscardCount(ctx.state, playerId) },
  };
};

/**
 * PICKED — то, что отмечено в открытом окне выбора (момент picked, окно ещё не закрыто):
 * бойцы, клетки или вариант эффекта.
 * value — список id, правило читает отметку как любое другое значение: `var: 'picked'` → `$picked`.
 * params: { is, min } — `is` проверяет конкретный отмеченный id («выбран вариант discharge»).
 */
export const PICKED = (ctx, params = {}) => {
  const picked = ctx.state?.targeting?.picked ?? null;
  const ids = picked == null ? [] : (Array.isArray(picked) ? picked : [picked]).map(String);

  if (params.is != null) {
    return { ok: ids.includes(String(params.is)), value: ids };
  }

  const min = params.min ?? 1;
  return { ok: ids.length >= min, value: ids };
};
