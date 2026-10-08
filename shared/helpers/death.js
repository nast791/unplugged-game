/**
 * Мост «боец повержен» между действием здоровья и движком правил.
 *
 * `SET_HEALTH` — низкий кирпич: он не должен знать про правила. Но момент `lost` обязателен, поэтому
 * действие зовёт `runDeathMoment`, а исполнителя регистрирует слой правил (`shared/rules/run.js`)
 * при загрузке. Так цикл импортов не возникает: `actions/health.js` тянет только этот файл,
 * а `rules/run.js` — и его, и действия.
 *
 * `info` — сведения об источнике смертельного урона: `{ source, playedCard, playerId }`. Кирпич берёт
 * их из самого действия (`runActionList` кладёт в каждое действие `source` и `playedCard`), поэтому
 * карта узнаёт смерть, которую нанесла сама.
 */
let runner = null;

/** Регистрирует исполнителя правил момента `lost` (вызывает слой правил при загрузке). */
export const setDeathRunner = fn => {
  runner = typeof fn === 'function' ? fn : null;
};

/**
 * Боец повержен: прогон правил момента `lost` — умение владельца и карта-источник
 * (если исполнитель уже зарегистрирован).
 */
export const runDeathMoment = (partyState, player, fighter, info = {}) => {
  if (!runner) return partyState;
  return runner(partyState, player, fighter, info);
};

export default runDeathMoment;
