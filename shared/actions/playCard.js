import { PHASES } from '@nast791/engine/constants';
import { TRIGGERS } from '@nast791/cards/constants';
import { getCardEngine } from '@nast791/cards/server';
import {
  CARD_TYPES,
  isAttackCard,
  isEffectCard,
} from '#shared/constants/cards.js';
import { SPEND_AP } from '#shared/events/index.js';
import {
  assertNoPendingCombat,
  assertNoPendingMovement,
  discardFromHand,
  findInHand,
} from '#shared/helpers.js';

/**
 * PLAY_CARD — type=effect: discard → cards.resolve(onPlay) → SPEND_AP.
 */
export const playCard = (state, action, api) => {
  if (state.phase !== PHASES.turn) {
    throw new Error(`PLAY_CARD только в phase=turn, сейчас "${state.phase}"`);
  }
  assertNoPendingCombat(state, 'PLAY_CARD');
  assertNoPendingMovement(state, 'PLAY_CARD');

  const cardId = action.cardId;
  if (cardId == null) {
    throw new Error('PLAY_CARD: нужен cardId');
  }

  const player = state.players.find(p => String(p.id) === String(action.playerId));
  if (!player) {
    throw new Error(`PLAY_CARD: игрок ${action.playerId} не найден`);
  }

  const { card } = findInHand(player, cardId);
  if (!card) {
    throw new Error(`PLAY_CARD: карты "${cardId}" нет в hand`);
  }

  if (isAttackCard(card.type)) {
    throw new Error('PLAY_CARD: attack|hybrid через ATTACK');
  }
  if (card.type === CARD_TYPES.defense) {
    throw new Error('PLAY_CARD: defense через DEFEND (во время боя)');
  }
  if (!isEffectCard(card.type)) {
    throw new Error(
      `PLAY_CARD: type="${card.type}" не поддержан (нужен effect)`,
    );
  }

  discardFromHand(player, cardId);

  const { state: next } = getCardEngine().resolve(card, TRIGGERS.onPlay, {
    state,
    player,
    api,
    fighterId: action.fighterId,
  });

  SPEND_AP(next);
  if (next.actionsLeft === 0) {
    return api.enterTurnEnd(next);
  }
  return next;
};

export default playCard;
