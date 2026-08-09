import { livingHeroes, zoneCards } from '#shared/helpers.js';
import { DEAL_DAMAGE } from './dealDamage.js';

/** EXHAUSTION — урон герою, когда нечего добирать. */
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
    if (next.hook === 'gameEnd') return next;
  }
  return next;
};

export default EXHAUSTION;
