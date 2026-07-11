import { findFighter } from '#shared/lib.js';
import { CHECK_WINNER } from './checkWinner.js';

/** DEAL_DAMAGE — урон по fighterId; мёртвых убрать; затем CHECK_WINNER. */
export const DEAL_DAMAGE = (
  state,
  { fighterId, damage } = {},
  { api } = {},
) => {
  const amount = Math.max(0, Number(damage) || 0);
  const { player, fighter, index } = findFighter(state, fighterId);
  if (!player || !fighter) {
    throw new Error(`DEAL_DAMAGE: fighter "${fighterId}" не найден`);
  }

  const nextHp = Math.max(0, Number(fighter.currentHp) - amount);
  if (nextHp <= 0) {
    player.fighters.splice(index, 1);
  } else {
    player.fighters[index] = { ...fighter, currentHp: nextHp };
  }

  return CHECK_WINNER(state, {}, { api });
};

export default DEAL_DAMAGE;
