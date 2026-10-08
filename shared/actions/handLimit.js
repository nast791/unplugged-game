import { findPlayer } from '#shared/helpers/base.js';

/**
 * Враг ли этот игрок владельцу правила. Роль считаем так же, как проекция (`server/party.js`):
 * союзник — тот, у кого та же команда; в дуэли команд нет, поэтому любой другой — враг.
 */
const isEnemy = (owner, other) => {
  if (String(other.id) === String(owner.id)) return false;
  if (owner.team != null && other.team != null && String(owner.team) === String(other.team)) {
    return false;
  }
  return true;
};

const targetsFor = (partyState, owner, scope) =>
  (partyState.players ?? []).filter(player => {
    if (scope === 'all') return true;
    if (scope === 'self') return String(player.id) === String(owner.id);
    if (scope === 'enemies') return isEnemy(owner, player);
    return String(player.id) === scope;
  });

/**
 * SET_HAND_LIMIT — лимит руки другому игроку. `of`: `enemies` (враги владельца правила — по умолчанию),
 * `self`, `all` или id игрока; `value: null` возвращает общий лимит (`rules.maxHandSize`).
 *
 * Так описано умение Снежной королевы «Вечная мерзлота»: пока в её сбросе шесть осколков, её враги
 * держат пять карт. Союзники и сама королева лимит не теряют, поэтому правило ходит именно по врагам.
 * Читает лимит `shared/helpers/turn.js` (`handLimitFor`).
 */
export const SET_HAND_LIMIT = (partyState, action = {}) => {
  const ownerId = action.playerId ?? partyState.turn?.playerId;
  const owner = findPlayer(partyState, ownerId);
  if (!owner) throw new Error(`SET_HAND_LIMIT: игрок ${ownerId} не найден`);

  const value = action.value == null || action.value === '' ? null : Number(action.value);
  if (value != null && (!Number.isFinite(value) || value < 0)) {
    throw new Error(
      `SET_HAND_LIMIT: value "${action.value}" (нужно неотрицательное число или null)`,
    );
  }

  for (const player of targetsFor(partyState, owner, String(action.of ?? 'enemies'))) {
    if (value == null) delete player.handLimit;
    else player.handLimit = value;
  }
  return partyState;
};

export default SET_HAND_LIMIT;
