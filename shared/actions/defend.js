import { PHASES } from '@nast791/engine/constants';
import { isDefenseCard } from '#shared/constants/cards.js';
import { RESOLVE_COMBAT } from '#shared/events/index.js';
import { discardFromHand } from '#shared/lib.js';

/**
 * DEFEND — { cardId? }; defense|hybrid или пас (defense=0).
 * Победитель боя: RESOLVE_COMBAT (только боевые числа карт).
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
  if (action.cardId != null) {
    const card = discardFromHand(defender, action.cardId);
    if (!card) {
      throw new Error(`DEFEND: карты "${action.cardId}" нет в hand`);
    }
    if (!isDefenseCard(card.type)) {
      throw new Error(
        `DEFEND: карта type="${card.type}" (нужен defense|hybrid)`,
      );
    }
    defenseValue = Number(card.value) || 0;
    defendedWithCard = true;
  }

  const next = RESOLVE_COMBAT(
    state,
    { combat, defenseValue, defendedWithCard },
    { api },
  );
  if (next.phase === PHASES.gameEnd) {
    return next;
  }
  if (next.actionsLeft === 0) {
    return api.enterTurnEnd(next);
  }
  return next;
};

export default defend;
