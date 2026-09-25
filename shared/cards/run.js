import { SET_COMBAT } from '#shared/actions-new/combat.js';
import { combatMomentsAt } from '#shared/constants/moments.js';
import { ruleMatches, runRules } from '#shared/rules/run.js';

/** Запас шагов: эффектов в бою мало, но защищаемся от зацикливания. */
const MAX_COMBAT_STEPS = 64;

const cardOf = (combat, side) =>
  side === 'defender' ? combat.defenseCard : combat.attackCard;

/**
 * Один шаг очереди: правила карты в её моменте.
 * Если правило открыло выбор эффекта, шаг остаётся в ожидании решения игрока (`waiting`) — бой на паузе.
 */
const runEffectStep = (partyState, step) => {
  const combat = partyState.combat;
  const card = cardOf(combat, step.side);
  const rules = card?.rules ?? [];

  const matched = rules.filter(
    rule =>
      rule.moment === step.moment &&
      ruleMatches(partyState, rule, { playerId: step.playerId }),
  );

  if (matched.length === 0) {
    step.status = 'skipped';
    return partyState;
  }

  const state = runRules(partyState, rules, step.moment, {
    playerId: step.playerId,
    source: step.cardId,
  });

  step.status = state.combat?.choice ? 'waiting' : 'applied';
  return state;
};

/**
 * Доиграть бой до выбора эффекта игрока или до конца.
 *
 * Шаги берём из очереди `combat.effects` (её строит SET_COMBAT на вскрытии): до расчёта чисел идут
 * «немедленно» и «во время боя», после расчёта — «после боя». Момент шага решает, на какой стадии боя
 * он разыгрывается, поэтому эффект «после боя» видит уже готовый итог боя (факт COMBAT).
 * Эффекты, которые ждут решения игрока, остаются со статусом waiting — их доигрывает тот, кто ответил
 * (`SET_COMBAT boost` или `skip`), а этот проход снова вызывается после ответа.
 */
export const advanceCombat = partyState => {
  let state = partyState;

  for (let step = 0; step < MAX_COMBAT_STEPS; step += 1) {
    const combat = state.combat;
    if (!combat || combat.choice) return state;

    const stageMoments = combatMomentsAt(combat.stage);
    const pending = (combat.effects ?? []).find(
      entry =>
        entry.status === 'pending' && stageMoments.includes(entry.moment),
    );
    if (pending) {
      state = runEffectStep(state, pending);
      continue;
    }

    if (combat.stage === 'reveal') {
      state = SET_COMBAT(state, { op: 'reveal' });
      continue;
    }
    if (combat.stage === 'resolve') {
      state = SET_COMBAT(state, { op: 'resolve' });
      continue;
    }

    return SET_COMBAT(state, { op: 'close' });
  }

  throw new Error(`cards: бой не завершился за ${MAX_COMBAT_STEPS} шагов`);
};

export default advanceCombat;
