import { findFighter } from '#shared/helpers.js';
import { CHECK_WINNER } from './checkWinner.js';

/**
 * DEAL_DAMAGE — урон по бойцу/бойцам.
 *
 * { fighterId, damage }
 * { targets: id[], damage }
 * { target: N, damage } — взять N id из ctx.vars.targets (после HIGHLIGHT)
 */
export const DEAL_DAMAGE = (state, payload = {}, ctx = {}) => {
  const { api } = ctx;
  const amount = Math.max(0, Number(payload.damage) || 0);

  let targets = payload.targets;
  if (
    payload.fighterId == null &&
    !Array.isArray(targets) &&
    typeof payload.target === 'number'
  ) {
    targets = (ctx.vars?.targets ?? []).slice(0, payload.target);
  }

  const ids = [];
  if (payload.fighterId != null) ids.push(payload.fighterId);
  if (Array.isArray(targets)) ids.push(...targets);

  if (!ids.length) {
    throw new Error('DEAL_DAMAGE: нужен fighterId, targets или target (из vars)');
  }

  for (const fighterId of ids) {
    const { player: owner, fighter, index } = findFighter(state, fighterId);
    if (!owner || !fighter) {
      throw new Error(`DEAL_DAMAGE: fighter "${fighterId}" не найден`);
    }

    const nextHp = Math.max(0, Number(fighter.currentHp) - amount);
    if (nextHp <= 0) {
      owner.fighters.splice(index, 1);
    } else {
      owner.fighters[index] = { ...fighter, currentHp: nextHp };
    }
  }

  return CHECK_WINNER(state, {}, { api });
};

export default DEAL_DAMAGE;
