import { rules } from '#shared/constants/rules.js';
import { discardFromHand, zoneCards } from '#shared/helpers.js';

const asApi = x =>
  x && typeof x.enterTurnEnd === 'function' ? x : x?.api;

/** DISCARD_CARDS — сброс из hand при state.handDiscard. */
export const DISCARD_CARDS = (
  state,
  { playerId, cardId, cardIds } = {},
  ctxOrApi = {},
) => {
  const api = asApi(ctxOrApi);
  if (state.hook !== 'turn') {
    throw new Error(`DISCARD_CARDS только в hook=turn, сейчас "${state.hook}"`);
  }

  const pending = state.handDiscard;
  if (!pending) {
    throw new Error('DISCARD_CARDS: нет ожидания сброса (handDiscard)');
  }
  if (String(playerId) !== String(pending.playerId)) {
    throw new Error(
      `DISCARD_CARDS: сбрасывает игрок ${pending.playerId}, пришёл ${playerId}`,
    );
  }

  const player = state.players.find(p => String(p.id) === String(playerId));
  if (!player) {
    throw new Error(`DISCARD_CARDS: игрок ${playerId} не найден`);
  }

  const ids = Array.isArray(cardIds)
    ? cardIds
    : cardId != null
      ? [cardId]
      : [];
  if (!ids.length) {
    throw new Error('DISCARD_CARDS: нужен cardId или cardIds');
  }

  for (const id of ids) {
    const card = discardFromHand(player, id);
    if (!card) {
      throw new Error(`DISCARD_CARDS: карты "${id}" нет в hand`);
    }
  }

  const max = Number(pending.max) || rules.maxHandSize;
  const handLen = zoneCards(player.hand).length;

  if (handLen > max) {
    state.handDiscard = {
      ...pending,
      mustDiscard: handLen - max,
    };
    return state;
  }

  state.handDiscard = null;
  return api.enterTurnEnd(state);
};

export default DISCARD_CARDS;
