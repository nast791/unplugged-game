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

/**
 * Отметить единственного кандидата окна, открытого с `auto: true`: выбора нет, решает движок.
 * Так способность «выберите вражеского бойца в области» не спрашивает клик, когда враг один.
 * Возвращает null, если отмечать нечего (кандидатов не ровно один или он недоступен):
 * сравнивать состояние по ссылке нельзя — экшены меняют объект партии на месте.
 */
export const pickSingleCandidate = (partyState, playerId) => {
  const candidates = partyState.targeting?.candidates ?? [];
  if (candidates.length !== 1) return null;

  const candidate = candidates[0];
  // единственный вариант может быть недоступен (цена не сходится) — тогда решает игрок
  if (candidate?.disabled === true) return null;

  return SET_TARGETING(partyState, {
    op: 'pick',
    playerId,
    ...candidatePick(candidate),
  });
};

/** Закрыть окно выбора: движок делает это сам, когда игрок ответил. */
export const closeTargetingWindow = (partyState, playerId) =>
  partyState.targeting ? SET_TARGETING(partyState, { op: 'close', playerId }) : partyState;

export default pickSingleCandidate;
