import { SET_TARGETING } from '#shared/actions/targeting.js';

/** Ключ отметки зависит от вида окна: у клеток cellId, у вариантов optionId, иначе fighterId. */
export const candidatePick = candidate =>
  candidate == null
    ? null
    : candidate.cellId != null
      ? { cellId: candidate.cellId }
      : candidate.optionId != null
        ? { optionId: candidate.optionId }
        : { fighterId: candidate.fighterId };

/** Сколько целей просит окно: `count`; у окна без него (и у окна на одну цель) — одна. */
export const windowCount = targeting => Math.max(1, Number(targeting?.count) || 1);

/** Отмеченные цели окна списком: у окна на одну цель отметка скаляр, у окна на несколько — список. */
export const windowPicked = targeting => {
  const picked = targeting?.picked ?? null;
  if (picked == null) return [];
  return (Array.isArray(picked) ? picked : [picked]).map(String);
};

/** Собрано ли окно: отмечено ровно столько целей, сколько оно просит (у окна на одну — отметка). */
export const windowComplete = targeting => windowPicked(targeting).length >= windowCount(targeting);

/**
 * Готов ли выбор к применению: что-то отмечено, а обязательное окно (`required: true`) собрано целиком.
 * У необязательного окна раньше срока отметки — это его раннее закрытие: правило увидит только выбранное.
 */
export const windowReady = targeting =>
  windowPicked(targeting).length > 0 && (targeting?.required !== true || windowComplete(targeting));

/**
 * Отметить кандидатов окна, открытого с `auto: true`: выбора нет, решает движок.
 * Так способность «выберите вражеского бойца в области» не спрашивает клик, когда враг один,
 * а окно на две цели с ровно двумя кандидатами движок собирает сам.
 * Возвращает null, если выбор всё же есть (кандидатов не столько, сколько просит окно,
 * или среди них есть недоступный): сравнивать состояние по ссылке нельзя — экшены меняют объект партии на месте.
 */
export const pickAutoCandidates = (partyState, playerId) => {
  const targeting = partyState.targeting;
  const candidates = targeting?.candidates ?? [];
  if (candidates.length !== windowCount(targeting)) return null;
  if (candidates.some(candidate => candidate?.disabled === true)) return null;

  let state = partyState;
  for (const candidate of candidates) {
    state = SET_TARGETING(state, { op: 'pick', playerId, ...candidatePick(candidate) });
  }
  return state;
};

/** Закрыть окно выбора: движок делает это сам, когда игрок ответил. */
export const closeTargetingWindow = (partyState, playerId) =>
  partyState.targeting ? SET_TARGETING(partyState, { op: 'close', playerId }) : partyState;

export default pickAutoCandidates;
