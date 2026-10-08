import { findFighter } from '#shared/helpers/base.js';
import { runDeathMoment } from '#shared/helpers/death.js';

/**
 * id бойцов из параметров. Факты отдают объекты (FIGHTERS → { fighterId, … }), поэтому
 * принимаем и объект, и строку: иначе урон молча уходил бы в никуда.
 */
const targetIds = action => {
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
 * SET_HEALTH — здоровье бойцов: урон (delta < 0) и лечение (delta > 0).
 * params: { fighterId | fighterIds, delta }
 * Боец с 0 HP убирается с поля и попадает в `player.lost` — оттуда его возвращает эффект воскрешения
 * (REVIVE_FIGHTER). Ушедшего с поля бойца пропускаем без ошибки: к моменту расчёта эффекта или сдачи
 * игрока его может уже не быть. Проверка победы — отдельно (fact ALIVE_SIDES).
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
    if (!fighter) continue;

    const maxHp = Number(fighter.startHp);
    const limit = Number.isFinite(maxHp) ? maxHp : Infinity;
    const nextHp = Math.max(0, Math.min(limit, (Number(fighter.currentHp) || 0) + delta));

    if (nextHp <= 0) {
      player.fighters.splice(index, 1);
      player.lost = [...(player.lost ?? []), { ...fighter, currentHp: 0, currentPosition: null }];

      // Момент `lost`: правила умения владельца погибшего бойца («когда ворона погибает…») и правила
      // карты, нанёсшей смертельный урон («погибает от этого эффекта»). Исполнителя даёт слой правил
      // (`shared/helpers/death.js`), поэтому кирпич здоровья о правилах не знает: он лишь передаёт
      // сведения об источнике, которые движок положил в каждое действие (`shared/rules/run.js`).
      runDeathMoment(partyState, player, fighter, {
        source: action.source ?? null,
        playedCard: action.playedCard ?? null,
        playerId: action.playerId ?? null,
      });
      continue;
    }

    player.fighters[index] = { ...fighter, currentHp: nextHp };
  }

  return partyState;
};

export default SET_HEALTH;
