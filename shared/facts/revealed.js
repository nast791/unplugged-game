/**
 * REVEALED — раскрытые карты: снимок, который положил SET_REVEAL («Раскройте» = показать всем).
 * params: { of, select: 'cards' | 'bonus', min?, max? }
 * `of` — чья колода раскрыта: id игрока, `'self'` (владелец правила) или `$переменная`
 * (в бою это противник: `COMBAT { player: 'opponent' }`).
 * `select: 'cards'` — список раскрытых карт (`cardId`, `name`, `value`, `bonus`), `min`/`max` — по их числу;
 * `select: 'bonus'` — сумма их бонусов числом (её подставляют прямо в параметр действия:
 * `SET_COMBAT { op: 'value', delta: '$bonus' }`), `min`/`max` — по самому числу.
 */
export const REVEALED = (ctx, params = {}) => {
  const ownerId =
    params.of === 'self'
      ? (ctx.player?.id ?? ctx.playerId ?? ctx.state?.turn?.playerId)
      : params.of;
  const reveal = (ctx.state?.reveal ?? []).find(
    entry => String(entry.playerId) === String(ownerId),
  );
  const cards = (reveal?.cards ?? []).map(card => ({ ...card }));

  const min = Number(params.min ?? 0);
  const max = params.max == null ? Infinity : Number(params.max);

  if (String(params.select ?? 'cards') === 'bonus') {
    const bonus = cards.reduce((sum, card) => sum + (Number(card.bonus) || 0), 0);
    return { ok: bonus >= min && bonus <= max, value: bonus };
  }

  return { ok: cards.length >= min && cards.length <= max, value: cards };
};

export default REVEALED;
