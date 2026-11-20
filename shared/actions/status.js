import { findFighter } from '#shared/helpers/base.js';
import { STATUS_IDS, STATUS_UNTIL, STATUS_UNTIL_DEFAULT } from '#shared/constants/statuses.js';

/**
 * Статусы бойца, которые понимает движок. Список берётся из реестра (`shared/constants/statuses.js`):
 * там же название, иконка, описание и что статус запрещает, поэтому новый статус добавляется одним
 * файлом реестра, без правки этого действия.
 */
export const FIGHTER_STATUSES = STATUS_IDS;

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
 * params: { playerId?, fighterIds, status, value, until }
 *
 * `until` — когда статус снимется сам (`shared/constants/statuses.js: STATUS_UNTIL`): `turnEnd` (по
 * умолчанию) — на ближайшем конце хода, `ownerTurnEnd` — в конце хода владельца бойца. Срок хранится на
 * **экземпляре** (`fighter.statuses[id].until`), потому что один и тот же `frozen` живёт по-разному:
 * «Оцепенение» ставит его в тот же ход, который и заканчивает, а заклинание «до конца его хода»,
 * сыгранное в свой ход, должно пережить конец своего и сняться только у владельца.
 *
 * Снимает статусы `shared/lifecycle/turnEnd.js` (`releaseStatuses`), а досрочно — это же действие с
 * `value: false`: любое другое условие снятия задаёт правило карты, а не статус.
 */
export const SET_STATUS = (partyState, action = {}) => {
  const status = String(action.status ?? '');
  if (!FIGHTER_STATUSES.includes(status)) {
    throw new Error(
      `SET_STATUS: неизвестный статус "${status}" (нужны ${FIGHTER_STATUSES.join(' | ')})`,
    );
  }

  const until = action.until == null ? STATUS_UNTIL_DEFAULT : String(action.until);
  if (!STATUS_UNTIL.includes(until)) {
    throw new Error(`SET_STATUS: неизвестный срок "${until}" (нужны ${STATUS_UNTIL.join(' | ')})`);
  }

  const ids = fighterIdsOf(action);
  const value = action.value !== false;
  for (const fighterId of ids) {
    const { fighter } = findFighter(partyState, fighterId);
    if (!fighter) throw new Error(`SET_STATUS: боец ${fighterId} не найден`);
    if (value) {
      // прямое поле старого вида убираем: иначе статус переживёт собственное снятие
      delete fighter[status];
      fighter.statuses = { ...(fighter.statuses ?? {}), [status]: { until } };
    } else {
      if (fighter.statuses != null) {
        delete fighter.statuses[status];
        if (Object.keys(fighter.statuses).length === 0) delete fighter.statuses;
      }
      delete fighter[status];
    }
  }
  return partyState;
};

export default SET_STATUS;
