import { cardBonusValue, discardFromHand } from '#shared/helpers.js';

/** APPLY_BONUS — сброс карты ради bonus (movement и т.д.). */
export const APPLY_BONUS = (
  state,
  { cardId, stat = 'movement' } = {},
  { player } = {},
) => {
  if (state.hook !== 'turn') {
    throw new Error(`APPLY_BONUS только в hook=turn, сейчас "${state.hook}"`);
  }
  if (!player) {
    throw new Error('APPLY_BONUS: нужен player');
  }
  if (cardId == null) {
    throw new Error('APPLY_BONUS: нужен cardId');
  }

  const card = discardFromHand(player, cardId);
  if (!card) {
    throw new Error(`APPLY_BONUS: карты "${cardId}" нет в hand`);
  }

  const amount = cardBonusValue(card);

  if (stat === 'movement') {
    if (state.combat) {
      throw new Error('APPLY_BONUS: сначала завершите бой (DEFEND)');
    }
    if (!state.movement) {
      state.movement = {
        playerId: String(player.id),
        origins: {},
        bonus: 0,
      };
    }
    if (String(state.movement.playerId) !== String(player.id)) {
      throw new Error(
        `APPLY_BONUS: перемещение игрока ${state.movement.playerId}`,
      );
    }
    if (state.movement.bonusApplied) {
      throw new Error('APPLY_BONUS: перемещение уже усилено');
    }
    if (!state.movement.origins) state.movement.origins = {};
    state.movement.bonus = (Number(state.movement.bonus) || 0) + amount;
    state.movement.bonusApplied = true;
    state.movement.bonusFrom = card.instanceId ?? card.id;
    return state;
  }

  state.lastBonus = {
    amount,
    stat: String(stat),
    cardId: card.instanceId ?? card.id,
  };
  return state;
};

export default APPLY_BONUS;
