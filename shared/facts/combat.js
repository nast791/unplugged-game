/**
 * COMBAT — снимок lastCombat: проверка победителя + выбор бойца.
 *
 * params.winner (check, опционально):
 * - 'self'       — победил ctx.player
 * - 'opponent'   — победил не ctx.player
 * - 'attacker' | 'defender' — победила роль в бою
 * - { playerId } — победил этот игрок
 *
 * params.select (value → string[] fighterId, опционально):
 * - 'attacker' — attackerFighterId
 * - 'defender' — targetFighterId (кого били)
 * - 'winner'   — боец победившей стороны
 * - 'loser'    — боец проигравшей стороны
 *
 * Без winner и select: ok, если lastCombat есть; value = null.
 */
const matchWinner = (lc, winner, ctx) => {
  if (winner == null || winner === '') return true;

  if (typeof winner === 'object' && winner.playerId != null) {
    return String(lc.winnerPlayerId) === String(winner.playerId);
  }

  const key = String(winner);

  if (key === 'attacker' || key === 'defender') {
    return String(lc.winner) === key;
  }

  const selfId = ctx.player?.id;
  if (key === 'self') {
    if (selfId == null) return false;
    return String(lc.winnerPlayerId) === String(selfId);
  }

  if (key === 'opponent') {
    if (selfId == null) return false;
    return String(lc.winnerPlayerId) !== String(selfId);
  }

  throw new Error(
    `fact COMBAT: неизвестный winner "${key}" (self|opponent|attacker|defender|{ playerId })`,
  );
};

const fighterIdForSelect = (lc, select) => {
  const key = String(select);
  if (key === 'attacker') return lc.attackerFighterId;
  if (key === 'defender') return lc.targetFighterId;

  const winnerIsAttacker = String(lc.winner) === 'attacker';
  if (key === 'winner') {
    return winnerIsAttacker ? lc.attackerFighterId : lc.targetFighterId;
  }
  if (key === 'loser') {
    return winnerIsAttacker ? lc.targetFighterId : lc.attackerFighterId;
  }

  throw new Error(
    `fact COMBAT: неизвестный select "${key}" (attacker|defender|winner|loser)`,
  );
};

export const COMBAT = (ctx, params = {}) => {
  const lc = ctx.state?.lastCombat;
  if (!lc || lc.winner == null) {
    return { ok: false, value: null };
  }

  if (!matchWinner(lc, params.winner, ctx)) {
    return { ok: false, value: null };
  }

  if (params.select == null || params.select === '') {
    return { ok: true, value: null };
  }

  const id = fighterIdForSelect(lc, params.select);
  if (id == null || id === '') {
    return { ok: false, value: [] };
  }

  return {
    ok: true,
    value: [String(id)],
  };
};

export default COMBAT;
