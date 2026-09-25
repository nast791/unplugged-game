import { cardTypes } from '#shared/constants/deck.js';

/** Ключ карты: instanceId, иначе id. */
export const cardKey = card => String(card?.instanceId ?? card?.id);

/** Моменты хода, на которых применяется тип карты (constants/deck.js → cardTypes). */
export const cardMoments = card =>
  cardTypes.find(type => type.name === card?.type)?.turn ?? [];

export const isAttackCard = card => cardMoments(card).includes('attack');
export const isDefenseCard = card => cardMoments(card).includes('defense');
export const isEffectCard = card => cardMoments(card).includes('effect');

export const cardValue = card => Math.max(0, Number(card?.value) || 0);
export const cardBonus = card => Math.max(0, Number(card?.bonus) || 0);

/** Привязка карты к бойцу: пустое значение и 'any' — без привязки, иначе id своего бойца. */
export const cardFighterId = card => {
  const bound = card?.fighter;
  if (bound == null || String(bound) === '' || String(bound) === 'any') {
    return null;
  }
  return String(bound);
};

/**
 * Подходит ли боец под привязку карты: по id бойца или по его группе.
 * Помощники одного вида (три Гарпии) получают id `harpies_1..3` и общую группу `harpies`,
 * поэтому карта «Гарпий» подходит любой из них.
 */
export const fighterMatchesCard = (fighter, card) => {
  const bound = cardFighterId(card);
  if (bound == null) return true;
  if (fighter == null) return false;
  return String(fighter.id) === bound || String(fighter.group) === bound;
};

/**
 * Может ли игрок играть карту как своё действие: привязанный боец должен быть жив и стоять на поле.
 * Карты ушедшего бойца играть нельзя — они остаются только на усиление (bonus) и на сброс по эффекту.
 */
export const hasFighterForCard = (partyState, playerId, card) => {
  if (cardFighterId(card) == null) return true;

  const player = (partyState?.players ?? []).find(
    entry => String(entry.id) === String(playerId),
  );

  return (player?.fighters ?? []).some(
    fighter =>
      fighterMatchesCard(fighter, card) &&
      Number(fighter.currentHp) > 0 &&
      fighter.currentPosition != null,
  );
};
