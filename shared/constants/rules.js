import { RULES } from './tuning.js';

/** Дефолтные правила UnPlugged (не в state); меняемые числа — в `tuning.js`. */
export const rules = {
  ...RULES,
  canPassThroughTeammates: true,
  canPassThroughEnemies: false,
};
