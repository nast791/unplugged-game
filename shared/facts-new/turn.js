import { rules } from '#shared/constants/rules.js';
import {
  activePlayerId,
  handCards,
  isMomentMine,
  momentOf,
  mustDiscardCount,
} from '#shared/helpers/turn.js';

/** Игрок из контекста факта: явный playerId важнее ctx.player, иначе — активный игрок хода. */
const contextPlayerId = ctx =>
  ctx.playerId ?? ctx.player?.id ?? ctx.state?.turn?.playerId;

const cardView = card => ({
  cardId: String(card?.instanceId ?? card?.id),
  id: card?.id,
  type: card?.type,
  value: Number(card?.value) || 0,
  bonus: Number(card?.bonus) || 0,
});

/** ACTIVE_PLAYER — чей ход; params: { id } — проверить конкретного игрока. */
export const ACTIVE_PLAYER = (ctx, params = {}) => {
  const activeId = activePlayerId(ctx.state);
  const checkedId = params.id ?? ctx.playerId ?? ctx.player?.id ?? activeId;
  return {
    ok:
      activeId != null &&
      checkedId != null &&
      String(activeId) === String(checkedId),
    value: activeId == null ? null : String(activeId),
  };
};

/** AP — действий в ходу осталось; params: { min } (по умолчанию 1). */
export const AP = (ctx, params = {}) => {
  const left = Number(ctx.state?.turn?.actionsLeft) || 0;
  const min = params.min ?? 1;
  return { ok: left >= min, value: left };
};

/**
 * IN_PROGRESS — идёт ли момент хода (movement | combat | targeting).
 * params: { has, mine } — mine: true (по умолчанию) значит «момент мой».
 */
export const IN_PROGRESS = (ctx, params = {}) => {
  const names =
    params.has == null ? ['movement', 'combat', 'targeting'] : [params.has];
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
 * HAND — карты руки; params: { of, type, min, bonusMin }.
 * `of` — чья рука (id игрока), по умолчанию своя: эффекты вроде «враг сбрасывает карту» смотрят чужую руку.
 * bonusMin отсекает карты со слишком маленьким бонусом (например, «есть чем усилить атаку»).
 */
export const HAND = (ctx, params = {}) => {
  const ownerPlayerId = params.of ?? contextPlayerId(ctx);
  const cards = handCards(ctx.state, ownerPlayerId)
    .filter(card => params.type == null || card?.type === params.type)
    .filter(
      card =>
        params.bonusMin == null || (Number(card?.bonus) || 0) >= Number(params.bonusMin),
    );
  return {
    ok: params.min == null || cards.length >= params.min,
    value: cards.map(cardView),
  };
};

/** HAND_OVER_LIMIT — рука сверх лимита; params: { max }. */
export const HAND_OVER_LIMIT = (ctx, params = {}) => {
  const playerId = contextPlayerId(ctx);
  const size = handCards(ctx.state, playerId).length;
  const max = Number(params.max ?? rules.maxHandSize);
  return {
    ok: size > max,
    value: { size, max, mustDiscard: mustDiscardCount(ctx.state, playerId) },
  };
};

/**
 * PICKED — бойцы, отмеченные в открытом окне выбора (момент picked, окно ещё не закрыто).
 * value — список id, поэтому правило читает отметку так же, как любое другое значение: `var: 'picked'` → `$picked`.
 */
export const PICKED = (ctx, params = {}) => {
  const picked = ctx.state?.targeting?.picked ?? null;
  const ids =
    picked == null ? [] : (Array.isArray(picked) ? picked : [picked]).map(String);
  const min = params.min ?? 1;
  return { ok: ids.length >= min, value: ids };
};
