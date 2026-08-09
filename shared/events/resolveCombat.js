import { combat } from '#shared/constants/hooks.js';
import { participants } from '#shared/constants/roles.js';
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
 * Шаги пайплайна: before-фазы (defender→attacker) → numbers → after.
 */
export const buildCombatSteps = () => {
  const steps = [];
  const before = combat
    .filter(h => h.combat === 'before')
    .sort((a, b) => a.order - b.order);
  const after = combat
    .filter(h => h.combat === 'after')
    .sort((a, b) => a.order - b.order);

  const roles = [...participants].sort((a, b) => a.order - b.order);
  for (const hook of before) {
    for (const role of roles) {
      steps.push({ kind: 'effects', hook: hook.name, role: role.name });
    }
  }
  steps.push({ kind: 'numbers' });
  for (const hook of after) {
    for (const role of roles) {
      steps.push({ kind: 'effects', hook: hook.name, role: role.name });
    }
  }
  return steps;
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
    attackCardId: combat.attackCardId ?? combat.attackCard?.instanceId ?? null,
    defenseCardId: combat.defenseCardId ?? null,
  };

  state.combat = null;

  if (outcome.combatDamage > 0) {
    const next = DEAL_DAMAGE(
      state,
      { fighterId: combat.targetFighterId, damage: outcome.combatDamage },
      { api },
    );
    if (next.hook === 'gameEnd') return next;
    return next;
  }

  return state;
};

const cardForRole = (flow, role) =>
  role === 'defender' ? flow.defenseCard : flow.attackCard;

const playerIdForRole = (flow, role) =>
  role === 'defender'
    ? flow.combat.defenderPlayerId
    : flow.combat.attackerPlayerId;

/**
 * Продолжить пайплайн боя с combatFlow.stepIndex.
 * ctx.cards — createCardEngine / getCardEngine() (не импортируем здесь — цикл с cardEffects).
 */
export const continueCombat = (state, { api, cards } = {}) => {
  const flow = state.combatFlow;
  if (!flow) return state;

  const steps = buildCombatSteps();
  let next = state;

  while (flow.stepIndex < steps.length) {
    const step = steps[flow.stepIndex];

    if (step.kind === 'numbers') {
      next = RESOLVE_COMBAT(
        next,
        {
          combat: flow.combat,
          defenseValue: flow.defenseValue,
          defendedWithCard: flow.defendedWithCard,
        },
        { api },
      );
      flow.stepIndex += 1;
      if (next.hook === 'gameEnd') {
        next.combatFlow = null;
        return next;
      }
      continue;
    }

    const card = cardForRole(flow, step.role);
    if (!card) {
      flow.stepIndex += 1;
      continue;
    }

    if (!cards || typeof cards.dispatch !== 'function') {
      throw new Error('continueCombat: нужен ctx.cards с dispatch');
    }

    const player = (next.players ?? []).find(
      p => String(p.id) === String(playerIdForRole(flow, step.role)),
    );

    next = cards.dispatch(next, {
      api,
      phase: step.hook,
      sources: [{ doc: card, player, kind: 'card' }],
    });

    if (next.effectPrompt) {
      next.combatFlow = flow;
      return next;
    }

    flow.stepIndex += 1;
  }

  next.combatFlow = null;
  return next;
};

/**
 * Старт пайплайна боя (before → numbers → after).
 * payload: { combat, defenseValue, defendedWithCard?, defenseCard? }
 * ctx: { api, cards }
 */
export const RUN_COMBAT = (
  state,
  {
    combat,
    defenseValue = 0,
    defendedWithCard = false,
    defenseCard = null,
  } = {},
  ctx = {},
) => {
  if (!combat) {
    throw new Error('RUN_COMBAT: нет combat');
  }

  const defenseCardId =
    defenseCard?.instanceId ?? defenseCard?.id ?? null;

  state.combatFlow = {
    stepIndex: 0,
    defenseValue,
    defendedWithCard: Boolean(defendedWithCard),
    combat: {
      ...combat,
      defenseCardId,
    },
    attackCard: combat.attackCard ?? null,
    defenseCard: defenseCard ?? null,
  };

  return continueCombat(state, ctx);
};

/**
 * После cards.resume: если бой на паузе и prompt снят — следующий шаг.
 */
export const continueCombatAfterResume = (state, ctx = {}) => {
  if (!state?.combatFlow) return state;
  if (state.effectPrompt) return state;
  state.combatFlow.stepIndex += 1;
  return continueCombat(state, ctx);
};

export default RESOLVE_COMBAT;
