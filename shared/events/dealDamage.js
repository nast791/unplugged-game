import { findFighter } from '#shared/helpers.js';
import { resolveVar } from '#shared/facts/vars.js';
import { CHECK_WINNER } from './checkWinner.js';

/**
 * DEAL_DAMAGE — урон по бойцу/бойцам.
 *
 * { fighterId, damage }
 * { targets: id[] | '$var', damage }
 * { target: N, damage } — N id из ctx.vars.targets (после HIGHLIGHT)
 */
export const DEAL_DAMAGE = (state, payload = {}, ctx = {}) => {
  const { api } = ctx;
  const vars = ctx.vars ?? {};
  const amount = Math.max(0, Number(payload.damage) || 0);

  let fighterId = resolveVar(payload.fighterId, vars);
  let targets = resolveVar(payload.targets, vars);

  if (
    fighterId == null &&
    !Array.isArray(targets) &&
    typeof targets !== 'string' &&
    typeof payload.target === 'number'
  ) {
    targets = (vars.targets ?? []).slice(0, payload.target);
  }

  const ids = [];
  if (fighterId != null) ids.push(fighterId);
  if (Array.isArray(targets)) {
    ids.push(...targets);
  } else if (targets != null && targets !== '') {
    ids.push(targets);
  }

  if (!ids.length) {
    throw new Error('DEAL_DAMAGE: нужен fighterId, targets или target (из vars)');
  }

  for (const id of ids) {
    const { player: owner, fighter, index } = findFighter(state, id);
    if (!owner || !fighter) {
      throw new Error(`DEAL_DAMAGE: fighter "${id}" не найден`);
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
