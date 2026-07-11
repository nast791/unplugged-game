/** Типы карт контента. */
export const CARD_TYPES = {
  attack: 'attack',
  defense: 'defense',
  hybrid: 'hybrid',
  effect: 'effect',
};

export const isAttackCard = type =>
  type === CARD_TYPES.attack || type === CARD_TYPES.hybrid;

export const isDefenseCard = type =>
  type === CARD_TYPES.defense || type === CARD_TYPES.hybrid;

export const isEffectCard = type => type === CARD_TYPES.effect;
