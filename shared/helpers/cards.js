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
