/** Типы карт — из @nast791/cards; предикаты хоста. */
import { CARD_TYPES } from '@nast791/cards/constants';

export { CARD_TYPES };

export const isAttackCard = type =>
  type === CARD_TYPES.attack || type === CARD_TYPES.hybrid;

export const isDefenseCard = type =>
  type === CARD_TYPES.defense || type === CARD_TYPES.hybrid;

export const isEffectCard = type => type === CARD_TYPES.effect;
