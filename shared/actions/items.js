import { findPlayer } from '#shared/helpers/base.js';

const playerIdOf = (partyState, action) => action.playerId ?? partyState.turn?.playerId;

/** Все предметы игрока; `group` — общая группа копий (у катушек `coil`). */
export const playerItems = (partyState, playerId) => {
  const player = findPlayer(partyState, playerId);
  if (!player) throw new Error(`SET_ITEM: игрок ${playerId} не найден`);
  return player.items ?? [];
};

/**
 * SET_ITEM — состояние предметов игрока. Предметы, как помощники, лежат копиями: у каждой
 * свой id и общая группа, а `state` — состояние именно этой копии (его значения задаёт пак:
 * у катушек Теслы 'inactive' | 'active').
 * params: { playerId?, group? | itemId?, from?, to, count? }
 * С `from` переводит `count` подходящих копий (без `count` — все) из `from` в `to`; если подходящих
 * нет — ошибка: правило звало то, чего нет. Без `from` переводит в `to` те копии группы, что ещё не в нём
 * (без `count` — все такие): «активируйте 1 катушку» берёт именно разряженную, а повторный вызов
 * ничего не ломает (перевести уже переведённое — не ошибка). Так работает золотое правило
 * «выполняй ту часть свойства, которую можно выполнить».
 */
export const SET_ITEM = (partyState, action = {}) => {
  const to = action.to;
  if (to == null || to === '') throw new Error('SET_ITEM: нужен to (новое состояние)');

  const group = action.group ?? action.itemId ?? action.id;
  if (group == null) throw new Error('SET_ITEM: нужны group или itemId');

  const items = playerItems(partyState, playerIdOf(partyState, action));
  const groupItems = items.filter(
    item => String(item.id) === String(group) || String(item.group) === String(group),
  );
  if (groupItems.length === 0) {
    throw new Error(`SET_ITEM: у игрока нет предметов "${group}"`);
  }

  const strict = action.from != null;
  const candidates = strict
    ? groupItems.filter(item => String(item.state) === String(action.from))
    : groupItems.filter(item => String(item.state) !== String(to));

  if (strict && candidates.length === 0) {
    throw new Error(`SET_ITEM: у игрока нет предметов "${group}" в состоянии "${action.from}"`);
  }

  const count =
    action.count == null
      ? candidates.length
      : Math.max(0, Math.min(candidates.length, Number(action.count) || 0));

  for (const item of candidates.slice(0, count)) item.state = to;
  return partyState;
};

export default SET_ITEM;
