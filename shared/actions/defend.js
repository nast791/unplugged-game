import { PHASES } from '@nast791/engine/constants';
import { getCardEngine } from '@nast791/cards/server';
import { cardTypes } from '#shared/constants/deck.js';
import { RUN_COMBAT } from '#shared/events/index.js';
import { discardFromHand } from '#shared/helpers.js';

/**
 * DEFEND — { cardId? }; defense|hybrid или пас (defense=0).
 * Пайплайн боя: before-фазы → RESOLVE_COMBAT (числа) → after-фазы.
 */
export const defend = (state, action, api) => {
  if (state.phase !== PHASES.turn) {
    throw new Error(`DEFEND только в phase=turn, сейчас "${state.phase}"`);
  }
  const combat = state.combat;
  if (!combat) {
    throw new Error('DEFEND: нет активного боя');
  }
  if (String(action.playerId) !== String(combat.defenderPlayerId)) {
    throw new Error(
      `DEFEND: ждать игрока ${combat.defenderPlayerId}, пришёл ${action.playerId}`,
    );
  }

  const defender = state.players.find(
    p => String(p.id) === String(combat.defenderPlayerId),
  );
  if (!defender) {
    throw new Error(`DEFEND: игрок ${combat.defenderPlayerId} не найден`);
  }

  let defenseValue = 0;
  let defendedWithCard = false;
  let defenseCard = null;
  if (action.cardId != null) {
    defenseCard = discardFromHand(defender, action.cardId);
    if (!defenseCard) {
      throw new Error(`DEFEND: карты "${action.cardId}" нет в hand`);
    }
    if (!cardTypes.find(t => t.name === defenseCard.type)?.turn?.includes('defense')) {
      throw new Error(
        `DEFEND: карта type="${defenseCard.type}" (нужен defense|hybrid)`,
      );
    }
    defenseValue = Number(defenseCard.value) || 0;
    defendedWithCard = true;
  }

  const next = RUN_COMBAT(
    state,
    { combat, defenseValue, defendedWithCard, defenseCard },
    { api, cards: getCardEngine() },
  );

  if (next.effectPrompt) {
    return next;
  }
  if (next.phase === PHASES.gameEnd) {
    return next;
  }
  if (next.actionsLeft === 0) {
    return api.enterTurnEnd(next);
  }
  return next;
};

export default defend;
