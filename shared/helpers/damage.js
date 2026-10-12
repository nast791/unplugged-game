/**
 * «Наносил урон в этом ходу» — второй флаг бойца рядом с `movedThisTurn`
 * (`shared/actions/fighter.js`). Ставит его единственный источник урона — `SET_HEALTH`
 * (`shared/actions/health.js`), снимает начало хода (`shared/lifecycle/turnStart.js`),
 * читает факт `FIGHTERS { dealtDamageThisTurn }`.
 *
 * Флаг нужен условию «если герой не наносил урон в этом ходу» (умение Анубиса
 * «Взвешивание сердца»): раньше то же условие читало `movedThisTurn`, и удар в бою его не снимал,
 * хотя удар — тоже действие хода. Поэтому признак ставится и уроном карты или умения, и уроном боя.
 *
 * Как он ставится, три правила:
 * - **Владельцу урона, а не цели.** `SET_HEALTH` передаёт сюда `playerId` того, кто бьёт (правило
 *   карты — её владелец, бой — атакующий), поэтому флаг получает **бьющий**, а не тот, кому прилетело.
 *   Без этого «Взвешивание сердца» молчало бы у того, кого ударили, и работало бы у ударившего.
 * - **Чужому бойцу.** Свой боец, ударивший себя, урона «не наносил»: отличие то же, что между
 *   «шагнул» и «подставился» у `movedThisTurn`.
 * - **Лечение флаг не ставит:** «нанести урон» и «восстановить здоровье» — разные события.
 */

/** Кого ударили: id бойцов из действия здоровья (объекты факта тоже принимаются). */
const damagedFighterIds = action => {
  const list = Array.isArray(action.fighterIds)
    ? action.fighterIds
    : action.fighterId != null
      ? [action.fighterId]
      : [];

  return list
    .map(entry => {
      if (entry == null) return null;
      if (typeof entry === 'object') {
        const id = entry.fighterId ?? entry.id;
        return id == null ? null : String(id);
      }
      return String(entry);
    })
    .filter(Boolean);
};

/**
 * Отметить урон: все бойцы **наносящей** стороны получают флаг «наносил урон в этом ходу».
 * Чьи это бойцы, решает `action.playerId` (у правила — владелец карты или умения, у боя — атакующий),
 * а сам удар служит признаком, что ход не был тихим: своя сторона, ударившая себя, урона не наносила.
 */
export const noteDamageDealt = (partyState, action = {}) => {
  const damaged = damagedFighterIds(action);
  const owner = action.playerId ?? partyState.turn?.playerId ?? null;
  if (damaged.length === 0 || owner == null) return partyState;

  // кого бьют — чтобы отличить чужой урон от своего: свои id не считаются нанесённым уроном
  const own = new Set(
    (partyState.players ?? [])
      .filter(player => String(player.id) === String(owner))
      .flatMap(player => (player.fighters ?? []).map(fighter => String(fighter.id))),
  );
  if (!damaged.some(fighterId => !own.has(fighterId))) return partyState;

  for (const player of partyState.players ?? []) {
    if (String(player.id) !== String(owner)) continue;
    for (const fighter of player.fighters ?? []) {
      fighter.dealtDamageThisTurn = true;
    }
  }

  return partyState;
};

/**
 * Снять отметку начала хода — у всех бойцов: «в этом ходу» значит ровно один ход.
 * Зовётся рядом со снятием `movedThisTurn` (`shared/lifecycle/turnStart.js`) и возвращает новое
 * состояние: кирпичи этого хода правят вложенные объекты на месте, а флаг живёт на бойце.
 */
export const clearDamageDealt = partyState => {
  partyState.players = (partyState.players ?? []).map(player => ({
    ...player,
    fighters: (player.fighters ?? []).map(fighter =>
      fighter.dealtDamageThisTurn ? { ...fighter, dealtDamageThisTurn: false } : fighter,
    ),
  }));
  return partyState;
};

export default noteDamageDealt;
