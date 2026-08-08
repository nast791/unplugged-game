/** Типы карт. turn — хук хода (hooks.turn), на котором тип применяется. */
export const cardTypes = [
  { name: 'attack', turn: ['attack'] },
  { name: 'defense', turn: ['defense'] },
  { name: 'hybrid', turn: ['attack', 'defense'] },
  { name: 'effect', turn: ['effect'] },
];

/** Стопки карт у игрока. visibility — roles.visibility, кто видит карты (count — у всех). */
export const stacks = [
  { name: 'deck', visibility: [] },
  { name: 'hand', visibility: ['self', 'team'] },
  { name: 'discard', visibility: ['self', 'team', 'enemy'] },
];
