/** Хуки жизненного цикла партии (= state.hook). */
export const lifecycle = [
  { name: 'gameStart', order: 1 },
  { name: 'turnStart', order: 2 },
  { name: 'turn', order: 3 },
  { name: 'turnEnd', order: 4 },
  { name: 'gameEnd', order: 5 },
];

/** Фазы (брики) хука turn; order — приоритет в hook.phases. */
export const turn = [
  { name: 'handLimit', order: 0 },
  { name: 'choose', order: 1 },
  { name: 'movement', order: 2 },
  { name: 'attack', order: 3 },
  { name: 'defense', order: 4 },
  { name: 'waiting', order: 5 },
];

/**
 * Хуки эффектов карт в бою.
 * combat — до/после боевых чисел (value) карт.
 */
export const combat = [
  { name: 'instant', order: 1, combat: 'before', title: 'мгновенно' },
  { name: 'during_combat', order: 2, combat: 'before', title: 'во время битвы' },
  { name: 'after_combat', order: 3, combat: 'after', title: 'после битвы' },
];
