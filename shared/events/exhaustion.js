import { PHASES } from '@nast791/engine/constants';
import { livingHeroes } from '#shared/lib.js';
import { DEAL_DAMAGE } from './dealDamage.js';

/**
 * EXHAUSTION — истощение: урон герою (по умолчанию 2), когда нечего добирать.
 * Нужен api для CHECK_WINNER через DEAL_DAMAGE.
 */
export const EXHAUSTION = (
  state,
  { damage = 2 } = {},
  { player, api } = {},
) => {
  if (!player) {
    throw new Error('EXHAUSTION: нужен player');
  }
  const heroes = livingHeroes(player);
  if (!heroes.length) {
    return state;
  }

  const amount = Math.max(0, Number(damage) || 0);
  if (amount <= 0) return state;

  let next = state;
  for (const hero of heroes) {
    next = DEAL_DAMAGE(
      next,
      { fighterId: hero.id, damage: amount },
      { api },
    );
    if (next.phase === PHASES.gameEnd) return next;
  }
  return next;
};

export default EXHAUSTION;
