import { PHASES } from '@nast791/engine/constants';
import { DEAL_DAMAGE } from './dealDamage.js';

/**
 * Победитель боя — только боевые числа карт (не текстовые эффекты).
 * Атакующий: combatDamage >= 1; защитник: 0. Без защиты defense = 0.
 */
export const resolveCombatWinner = ({
  attackValue = 0,
  defenseValue = 0,
} = {}) => {
  const attack = Math.max(0, Number(attackValue) || 0);
  const defense = Math.max(0, Number(defenseValue) || 0);
  const combatDamage = Math.max(0, attack - defense);
  const winner = combatDamage > 0 ? 'attacker' : 'defender';
  return { attack, defense, combatDamage, winner };
};

/**
 * RESOLVE_COMBAT — итог боя по числам карт → lastCombat + боевой урон цели.
 * payload: { combat, defenseValue, defendedWithCard? }
 */
export const RESOLVE_COMBAT = (
  state,
  { combat, defenseValue = 0, defendedWithCard = false } = {},
  { api } = {},
) => {
  if (!combat) {
    throw new Error('RESOLVE_COMBAT: нет combat');
  }

  const outcome = resolveCombatWinner({
    attackValue: combat.attackValue,
    defenseValue,
  });

  state.lastCombat = {
    attackerPlayerId: String(combat.attackerPlayerId),
    defenderPlayerId: String(combat.defenderPlayerId),
    attackerFighterId: String(combat.attackerFighterId),
    targetFighterId: String(combat.targetFighterId),
    attackValue: outcome.attack,
    defenseValue: outcome.defense,
    combatDamage: outcome.combatDamage,
    winner: outcome.winner,
    winnerPlayerId:
      outcome.winner === 'attacker'
        ? String(combat.attackerPlayerId)
        : String(combat.defenderPlayerId),
    defendedWithCard: Boolean(defendedWithCard),
  };

  state.combat = null;

  if (outcome.combatDamage > 0) {
    const next = DEAL_DAMAGE(
      state,
      { fighterId: combat.targetFighterId, damage: outcome.combatDamage },
      { api },
    );
    if (next.phase === PHASES.gameEnd) return next;
    return next;
  }

  return state;
};

export default RESOLVE_COMBAT;
