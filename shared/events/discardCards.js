import { PHASES } from '@nast791/engine/constants';
import { maxHandSize } from '#shared/constants/hand.js';
import { discardFromHand } from '#shared/helpers.js';

/** api экшена или ctx карт с .api */
const asApi = x =>
  x && typeof x.enterTurnEnd === 'function' ? x : x?.api;

/**
 * DISCARD_CARDS — сброс из hand при state.handDiscard.
 * Тот же handler для sendAction и card effects.
 */
export const DISCARD_CARDS = (
  state,
  { playerId, cardId, cardIds } = {},
  ctxOrApi = {},
) => {
  const api = asApi(ctxOrApi);
  if (state.phase !== PHASES.turn) {
    throw new Error(`DISCARD_CARDS только в phase=turn, сейчас "${state.phase}"`);
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

  const max = Number(pending.max) || maxHandSize(state);
  const handLen = Array.isArray(player.hand) ? player.hand.length : 0;

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
