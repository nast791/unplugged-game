import { findPlayer, setZoneCards, zoneCards } from '#shared/helpers/base.js';
import { cardKey, cardValue } from '#shared/helpers/cards.js';

/**
 * RECALL_PLAYED_CARD — вернуть в руку карту, которой только что сыграли, со сдвигом её значения.
 * Так работает «Вечный огонь» ифрита: сыграна с лавы — возвращается в руку, но каждый раз на 1 слабее,
 * а на нуле остаётся в сбросе (карта выгорела и больше не возвращается).
 *
 * Карту берём не по id, а по самой копии: `playedCard` подставляет `runRules` — это та карта, чьи
 * правила сейчас идут (у копий своё значение, поэтому «выгорает» именно сыгранная).
 *
 * В окне «после битвы» карта ещё лежит в бою (`combat.attackCard` / `defenseCard`): бой закрывается
 * позже, и только там разыгранные карты уходят в сброс. Поэтому карта ищется и в бою — тогда её
 * помечают `combat.recalled`, чтобы закрытие боя не отправило её в сброс повторно.
 *
 * params: { playedCard, valueDelta }
 *   valueDelta — на сколько сдвинуть значение (обычно −1);
 *   значение не уходит ниже нуля; при нуле карта остаётся в сбросе (или в бою — его закроют как обычно).
 */
export const RECALL_PLAYED_CARD = (partyState, action = {}) => {
  const playerId = action.playerId ?? partyState.turn?.playerId;
  if (playerId == null) throw new Error('RECALL_PLAYED_CARD: нужен playerId');

  const player = findPlayer(partyState, playerId);
  if (!player) throw new Error(`RECALL_PLAYED_CARD: игрок ${playerId} не найден`);

  // правило вызвано не картой (способность, фаза) — возвращать нечего
  const played = action.playedCard;
  if (played == null) return partyState;

  const key = cardKey(played);
  const delta = Number(action.valueDelta) || 0;

  const combat = partyState.combat ?? null;
  const slotKey =
    combat == null
      ? null
      : String(combat.attackerPlayerId) === String(playerId)
        ? 'attackCard'
        : String(combat.defenderPlayerId) === String(playerId)
          ? 'defenseCard'
          : null;
  const inCombat = slotKey != null && combat[slotKey] != null && cardKey(combat[slotKey]) === key;

  const discard = zoneCards(player.discard);
  const index = discard.findIndex(card => cardKey(card) === key);
  // карты нет ни в бою, ни в сбросе: ушла на усиление или была отменена
  if (!inCombat && index < 0) return partyState;

  const source = inCombat ? combat[slotKey] : discard[index];
  const nextValue = Math.max(0, cardValue(source) + delta);

  if (nextValue <= 0) {
    // карта выгорела: в руку не возвращается — но и не исчезает. В бою её оставляем на месте
    // (закрытие боя положит её в сброс), в сбросе просто обнуляем значение.
    if (inCombat) combat[slotKey] = { ...source, value: 0 };
    else {
      setZoneCards(
        player,
        'discard',
        discard.map((card, position) => (position === index ? { ...card, value: 0 } : card)),
      );
    }
    return partyState;
  }

  if (inCombat) {
    // объект боя остаётся на месте (по нему движок ищет правила шагов), но закрытие боя его не сбросит
    combat[slotKey] = { ...source, value: nextValue };
    combat.recalled = { ...(combat.recalled ?? {}), [slotKey]: true };
  }

  const recalled = { ...source, value: nextValue };
  if (!inCombat) {
    setZoneCards(
      player,
      'discard',
      discard.filter((_, position) => position !== index),
    );
  }
  setZoneCards(player, 'hand', [...zoneCards(player.hand), recalled]);
  return partyState;
};

export default RECALL_PLAYED_CARD;
