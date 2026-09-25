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
 *
 * params.select (значение → список fighterId, необязательно):
 * - 'attacker' — attackerFighterId
 * - 'target'   — атакованный боец (targetFighterId): герой или помощник, кого выбрали целью
 * - 'self'     — свой боец в этом бою (у атакующего атакующий, у защитника — тот, кого били)
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

const fighterIdForSelect = (lastCombat, select, ctx) => {
  const key = String(select);
  if (key === 'attacker') return lastCombat.attackerFighterId;
  if (key === 'target') return lastCombat.targetFighterId;
  if (key === 'self') return ownFighterId(lastCombat, ctx);

  const winnerIsAttacker = String(lastCombat.winner) === 'attacker';
  if (key === 'winner') {
    return winnerIsAttacker
      ? lastCombat.attackerFighterId
      : lastCombat.targetFighterId;
  }
  if (key === 'loser') {
    return winnerIsAttacker
      ? lastCombat.targetFighterId
      : lastCombat.attackerFighterId;
  }

  throw new Error(
    `fact COMBAT: неизвестный select "${key}" (attacker|target|self|winner|loser)`,
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

  throw new Error(
    `fact COMBAT: неизвестный player "${key}" (self|opponent|attacker|defender)`,
  );
};

export const COMBAT = (ctx, params = {}) => {
  const lastCombat = ctx.state?.lastCombat;
  if (!lastCombat || lastCombat.winner == null) {
    return { ok: false, value: null };
  }
  if (!matchWinner(lastCombat, params.winner, ctx)) {
    return { ok: false, value: null };
  }

  if (params.player != null && params.player !== '') {
    const playerId = playerIdForSide(lastCombat, params.player, ctx);
    return playerId == null || playerId === ''
      ? { ok: false, value: null }
      : { ok: true, value: String(playerId) };
  }

  if (params.select == null || params.select === '') {
    return { ok: true, value: null };
  }

  const fighterId = fighterIdForSelect(lastCombat, params.select, ctx);
  if (fighterId == null || fighterId === '') {
    return { ok: false, value: [] };
  }

  return { ok: true, value: [String(fighterId)] };
};

export default COMBAT;
