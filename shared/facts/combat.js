/**
 * COMBAT — снимок lastCombat: проверка победителя и выбор бойца.
 *
 * params.winner (проверка, необязательно):
 * - 'self'       — победил ctx.player (тот, чью карту или способность прогоняем)
 * - 'opponent'   — победил не ctx.player
 * - 'attacker' | 'defender' — победила роль в бою
 * - { playerId } — победил этот игрок
 *
 * params.player (значение — id игрока, необязательно):
 * - 'self' | 'opponent' — участник боя со стороны ctx.player и его противник;
 * - 'attacker' | 'defender' — сторона боя.
 * Если бой ещё открыт (эффект «во время битвы»), стороны берутся из него: итог к этому моменту не посчитан,
 * а противник в этой битве уже известен.
 *
 * params.effects (значение — число правил карты этой стороны, необязательно):
 * - 'self' | 'opponent' — карта владельца правила и карта противника;
 * - 'attacker' | 'defender' — сторона боя. С `min` читается как «у карты есть эффекты».
 *
 * params.select (значение → список fighterId, необязательно):
 * - 'attacker' — attackerFighterId
 * - 'target'   — атакованный боец (targetFighterId): герой или помощник, кого выбрали целью
 * - 'self'     — свой боец в этом бою (у атакующего атакующий, у защитника — тот, кого били)
 * - 'opponent' — боец противника в этом бою (у атакующего — цель, у защитника — атакующий)
 * - 'winner'   — боец победившей стороны
 * - 'loser'    — боец проигравшей стороны
 *
 * Без winner и select: ok, если lastCombat есть; value = null.
 */
const matchWinner = (lastCombat, winner, ctx) => {
  if (winner == null || winner === '') return true;

  if (typeof winner === 'object' && winner.playerId != null) {
    return String(lastCombat.winnerPlayerId) === String(winner.playerId);
  }

  const key = String(winner);
  if (key === 'attacker' || key === 'defender') {
    return String(lastCombat.winner) === key;
  }

  const selfId = ctx.player?.id;
  if (selfId == null) return false;
  if (key === 'self') {
    return String(lastCombat.winnerPlayerId) === String(selfId);
  }
  if (key === 'opponent') {
    return String(lastCombat.winnerPlayerId) !== String(selfId);
  }

  throw new Error(
    `fact COMBAT: неизвестный winner "${key}" (self|opponent|attacker|defender|{ playerId })`,
  );
};

/** Боец владельца правила в этом бою: у атакующего — атакующий, у защитника — тот, кого били. */
const ownFighterId = (lastCombat, ctx) => {
  const selfId = ctx.player?.id ?? ctx.playerId ?? null;
  if (selfId == null) return null;
  if (String(lastCombat.attackerPlayerId) === String(selfId)) {
    return lastCombat.attackerFighterId;
  }
  if (String(lastCombat.defenderPlayerId) === String(selfId)) {
    return lastCombat.targetFighterId;
  }
  return null;
};

/** Боец противника в этом бою: у атакующего — цель, у защитника — атакующий. */
const otherFighterId = (lastCombat, ctx) => {
  const selfId = ctx.player?.id ?? ctx.playerId ?? null;
  if (selfId == null) return null;
  if (String(lastCombat.attackerPlayerId) === String(selfId)) {
    return lastCombat.targetFighterId;
  }
  if (String(lastCombat.defenderPlayerId) === String(selfId)) {
    return lastCombat.attackerFighterId;
  }
  return null;
};

const fighterIdForSelect = (lastCombat, select, ctx) => {
  const key = String(select);
  if (key === 'attacker') return lastCombat.attackerFighterId;
  if (key === 'target') return lastCombat.targetFighterId;
  if (key === 'self') return ownFighterId(lastCombat, ctx);
  if (key === 'opponent') return otherFighterId(lastCombat, ctx);

  const winnerIsAttacker = String(lastCombat.winner) === 'attacker';
  if (key === 'winner') {
    return winnerIsAttacker ? lastCombat.attackerFighterId : lastCombat.targetFighterId;
  }
  if (key === 'loser') {
    return winnerIsAttacker ? lastCombat.targetFighterId : lastCombat.attackerFighterId;
  }

  throw new Error(
    `fact COMBAT: неизвестный select "${key}" (attacker|target|self|opponent|winner|loser)`,
  );
};

/** Кто из участников боя: значение — id игрока, а не список (как NEXT_PLAYER). */
const playerIdForSide = (lastCombat, side, ctx) => {
  const key = String(side);
  if (key === 'attacker') return lastCombat.attackerPlayerId;
  if (key === 'defender') return lastCombat.defenderPlayerId;

  const selfId = ctx.player?.id ?? ctx.playerId ?? null;
  if (selfId == null) return null;

  const isAttacker = String(lastCombat.attackerPlayerId) === String(selfId);
  const isDefender = String(lastCombat.defenderPlayerId) === String(selfId);

  if (key === 'self') return isAttacker || isDefender ? String(selfId) : null;
  if (key === 'opponent') {
    if (isAttacker) return lastCombat.defenderPlayerId;
    if (isDefender) return lastCombat.attackerPlayerId;
    return null;
  }

  throw new Error(`fact COMBAT: неизвестный player "${key}" (self|opponent|attacker|defender)`);
};

/** Ключ карты владельца правила в текущем бою. */
const ownCardKey = (combat, ctx) => {
  const selfId = ctx.player?.id ?? ctx.playerId ?? null;
  if (selfId == null) return null;
  if (String(combat.attackerPlayerId) === String(selfId)) return 'attackCard';
  if (String(combat.defenderPlayerId) === String(selfId)) return 'defenseCard';
  return null;
};

/**
 * Сколько правил у карты стороны в текущем бою. Нужно эффектам отмены: если у карты противника
 * нет ни одного эффекта, отменять нечего (`COMBAT { effects: 'opponent' }, min: 1`).
 */
const effectsCountFor = (state, ctx, side) => {
  const combat = state?.combat;
  if (!combat) return 0;

  const key = String(side);
  if (key === 'attacker') return (combat.attackCard?.rules ?? []).length;
  if (key === 'defender') return (combat.defenseCard?.rules ?? []).length;

  const ownKey = ownCardKey(combat, ctx);
  if (ownKey == null) return 0;
  if (key === 'self') return (combat[ownKey]?.rules ?? []).length;
  if (key === 'opponent') {
    const other = ownKey === 'attackCard' ? 'defenseCard' : 'attackCard';
    return (combat[other]?.rules ?? []).length;
  }

  throw new Error(`fact COMBAT: неизвестный effects "${key}" (self|opponent|attacker|defender)`);
};

/**
 * Источник сторон боя: открытый бой (итога ещё нет, но участники известны) — для правил «во время битвы»
 * с `params.player`; иначе итог последнего боя. Итог без победителя сторонами не считается.
 */
const battleFor = (state, wantsCurrent) => {
  if (wantsCurrent && state?.combat) return state.combat;

  const lastCombat = state?.lastCombat;
  return lastCombat && lastCombat.winner != null ? lastCombat : null;
};

export const COMBAT = (ctx, params = {}) => {
  // «есть ли эффекты у карты стороны» читается и до расчёта чисел: итог боя тут не нужен
  if (params.effects != null && params.effects !== '') {
    const count = effectsCountFor(ctx.state, ctx, params.effects);
    return { ok: params.min == null || count >= Number(params.min), value: count };
  }

  // победитель — свойство завершённого боя: его читаем из итога, а не из открытого боя
  if (params.winner != null && params.winner !== '') {
    const lastCombat = ctx.state?.lastCombat;
    if (!lastCombat || !matchWinner(lastCombat, params.winner, ctx)) {
      return { ok: false, value: null };
    }
  }

  // Участники: у эффекта «во время битвы» итога ещё нет, но открытый бой знает свои стороны —
  // «противник» здесь тот, чей боец стоит против меня в этой битве (в 2v2 — не его напарник).
  const battle = battleFor(ctx.state, params.player != null && params.player !== '');
  if (!battle) return { ok: false, value: null };

  if (params.player != null && params.player !== '') {
    const playerId = playerIdForSide(battle, params.player, ctx);
    return playerId == null || playerId === ''
      ? { ok: false, value: null }
      : { ok: true, value: String(playerId) };
  }

  if (params.select == null || params.select === '') {
    return { ok: true, value: null };
  }

  const fighterId = fighterIdForSelect(battle, params.select, ctx);
  if (fighterId == null || fighterId === '') {
    return { ok: false, value: [] };
  }

  return { ok: true, value: [String(fighterId)] };
};

export default COMBAT;
