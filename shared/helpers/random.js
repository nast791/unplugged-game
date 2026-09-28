/**
 * Случайность партии: не `Math.random`, а последовательность от сида.
 * Сид лежит в `state.settings.seed` (проекция его вырезает, клиенту он не нужен), а текущее значение
 * последовательности — в `state.rng`: его нет в `stateFields`, значит наружу оно не отдаётся.
 * Так партия воспроизводима (тот же сид — те же сбросы), а тесты детерминированы: своя партия — своя
 * последовательность, и «случайную» карту можно проверить точно.
 */

/** Линейный конгруэнтный генератор: число от 0 до 2^32-1. */
const nextValue = value => (Math.imul(value, 1103515245) + 12345) >>> 0;

const seedOf = partyState => Number(partyState?.settings?.seed ?? 1) || 1;

/** Текущее значение последовательности; если его ещё нет — берём из сида партии. */
const cursorOf = partyState => {
  const stored = Number(partyState.rng);
  if (Number.isFinite(stored) && stored > 0) return stored;

  partyState.rng = nextValue(seedOf(partyState));
  return partyState.rng;
};

/** Один шаг последовательности: двигает курсор партии и отдаёт число. */
export const randomValue = partyState => {
  partyState.rng = nextValue(cursorOf(partyState));
  return partyState.rng;
};

/** Случайный элемент списка (null — если список пуст). */
export const randomPick = (partyState, list) => {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[randomValue(partyState) % list.length];
};

export default randomPick;
