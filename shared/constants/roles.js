/** Кто может видеть карты стопки (count — у всех). */
export const visibility = [
  { name: 'self' },
  { name: 'team' },
  { name: 'enemy' },
];

/** Боевые роли. order — порядок эффектов в фазе. */
export const participants = [
  { name: 'defender', order: 1 },
  { name: 'attacker', order: 2 },
];

/** Роли относительно ctx.player (facts, UI). */
export const player = [
  { name: 'self' },
  { name: 'opponent' },
  { name: 'teammate' },
];
