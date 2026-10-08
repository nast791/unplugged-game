import { findFighter } from '#shared/helpers/base.js';

/** Статусы бойца, которые понимает движок: `frozen` — «заморожен» (не двигается и не телепортируется). */
export const FIGHTER_STATUSES = ['frozen'];

const fighterIdsOf = action => {
  const raw = action.fighterIds ?? action.fighterId;
  if (raw == null) return [];
  return (Array.isArray(raw) ? raw : [raw])
    .map(entry => {
      if (entry == null) return null;
      if (typeof entry === 'object') return entry.fighterId ?? entry.id ?? null;
      return entry;
    })
    .filter(value => value != null)
    .map(String);
};

/**
 * SET_STATUS — статус бойца: `frozen` ставит «заморожен», `value: false` его снимает.
 * params: { playerId?, fighterIds, status, value }
 * Снимает статусы сам движок: `frozen` живёт до конца хода (`shared/lifecycle/turnEnd.js`), потому что
 * «заморожен до конца своего хода» — это ровно тот ход, в котором боец и получил статус.
 */
export const SET_STATUS = (partyState, action = {}) => {
  const status = String(action.status ?? '');
  if (!FIGHTER_STATUSES.includes(status)) {
    throw new Error(
      `SET_STATUS: неизвестный статус "${status}" (нужны ${FIGHTER_STATUSES.join(' | ')})`,
    );
  }

  const ids = fighterIdsOf(action);
  const value = action.value !== false;
  for (const fighterId of ids) {
    const { fighter } = findFighter(partyState, fighterId);
    if (!fighter) throw new Error(`SET_STATUS: боец ${fighterId} не найден`);
    if (value) fighter[status] = true;
    else delete fighter[status];
  }
  return partyState;
};

export default SET_STATUS;
