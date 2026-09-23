import { findFighter } from '#shared/helpers/base.js';

const targetIds = action => {
  if (Array.isArray(action.fighterIds)) return action.fighterIds;
  if (action.fighterId != null) return [action.fighterId];
  return [];
};

/**
 * SET_HEALTH — здоровье бойцов: урон (delta < 0) и лечение (delta > 0).
 * params: { fighterId | fighterIds, delta }
 * Боец с 0 HP убирается с поля. Проверка победы — отдельно (fact ALIVE_SIDES).
 */
export const SET_HEALTH = (partyState, action = {}) => {
  const ids = targetIds(action);
  if (ids.length === 0) {
    throw new Error('SET_HEALTH: нужны fighterId или fighterIds');
  }

  const delta = Number(action.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('SET_HEALTH: нужен ненулевой delta');
  }

  for (const fighterId of ids) {
    const { player, fighter, index } = findFighter(partyState, fighterId);
    if (!fighter) {
      throw new Error(`SET_HEALTH: боец "${fighterId}" не найден`);
    }

    const maxHp = Number(fighter.startHp);
    const limit = Number.isFinite(maxHp) ? maxHp : Infinity;
    const nextHp = Math.max(
      0,
      Math.min(limit, (Number(fighter.currentHp) || 0) + delta),
    );

    if (nextHp <= 0) {
      player.fighters.splice(index, 1);
      continue;
    }

    player.fighters[index] = { ...fighter, currentHp: nextHp };
  }

  return partyState;
};

export default SET_HEALTH;
