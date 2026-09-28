import { findPlayer } from '#shared/helpers/base.js';

const playerIdOf = (partyState, action) => action.playerId ?? partyState.turn?.playerId;

/**
 * Кандидаты выбора. `kind: 'fighters'` — бойцы (как отдаёт факт FIGHTERS) или их id,
 * `kind: 'cells'` — клетки карты (id клеток), `kind: 'options'` — варианты эффекта карты
 * (например, «активировать обе катушки» или «деактивировать обе»).
 */
const normalizeCandidates = (candidates, kind = 'fighters') => {
  const list = Array.isArray(candidates) ? candidates : [];

  return list
    .map(entry => {
      if (entry == null) return null;

      if (kind === 'cells') {
        const cellId = typeof entry === 'object' ? (entry.cellId ?? entry.id) : entry;
        return cellId == null ? null : { cellId: String(cellId) };
      }

      if (kind === 'options') {
        const optionId = typeof entry === 'object' ? (entry.optionId ?? entry.id) : entry;
        if (optionId == null) return null;
        return {
          optionId: String(optionId),
          title: (typeof entry === 'object' && entry.title) || null,
          // вариант, который сейчас нельзя выбрать: клиент рисует его неактивным
          disabled: typeof entry === 'object' && entry.disabled === true,
        };
      }

      if (typeof entry === 'object') {
        const fighterId = entry.fighterId ?? entry.id;
        if (fighterId == null) return null;
        return {
          fighterId: String(fighterId),
          playerId: entry.playerId == null ? null : String(entry.playerId),
          name: entry.name ?? null,
          position: entry.position ?? null,
        };
      }
      return { fighterId: String(entry), playerId: null, name: null, position: null };
    })
    .filter(Boolean);
};

const openTargeting = (partyState, action) => {
  if (partyState.targeting) {
    throw new Error('SET_TARGETING: выбор цели уже открыт');
  }

  const playerId = playerIdOf(partyState, action);
  if (playerId == null) throw new Error('SET_TARGETING: нужен playerId');
  if (!findPlayer(partyState, playerId)) {
    throw new Error(`SET_TARGETING: игрок ${playerId} не найден`);
  }

  /** Сколько целей нужно отметить. Пока поддержана ровно одна цель — окно закрывается по клику. */
  const count = Number(action.count ?? 1);
  if (count !== 1) {
    throw new Error(`SET_TARGETING: пока поддерживается ровно одна цель (count: ${action.count})`);
  }

  const kind = action.kind ?? 'fighters';
  if (!['fighters', 'cells', 'options'].includes(kind)) {
    throw new Error(`SET_TARGETING: kind "${action.kind}" (нужны fighters | cells | options)`);
  }

  const candidates = normalizeCandidates(action.candidates, kind);
  if (candidates.length === 0) {
    throw new Error('SET_TARGETING: нужны candidates (хотя бы один)');
  }

  partyState.targeting = {
    playerId: String(playerId),
    source: action.source ?? null,
    required: action.required === true,
    // окно открыто «без выбора»: если кандидат один, движок отметит его сам (autoPick в runRules)
    auto: action.auto === true,
    kind,
    count,
    candidates,
    picked: null,
  };
  return partyState;
};

const pickTargeting = (partyState, action) => {
  const targeting = partyState.targeting;
  if (!targeting) throw new Error('SET_TARGETING: выбор цели не открыт');

  const playerId = playerIdOf(partyState, action);
  if (String(targeting.playerId) !== String(playerId)) {
    throw new Error('SET_TARGETING: это чужой выбор цели');
  }

  const wanted = String(action.optionId ?? action.fighterId ?? action.cellId ?? action.id);
  const byCell = targeting.kind === 'cells';
  const byOption = targeting.kind === 'options';
  const chosen = byCell
    ? targeting.candidates.find(entry => String(entry.cellId) === wanted)
    : byOption
      ? targeting.candidates.find(entry => String(entry.optionId) === wanted)
      : targeting.candidates.find(entry => String(entry.fighterId) === wanted);

  if (!chosen) {
    throw new Error(
      byCell
        ? `SET_TARGETING: клетка "${wanted}" не среди кандидатов`
        : byOption
          ? `SET_TARGETING: вариант "${wanted}" не среди кандидатов`
          : `SET_TARGETING: боец "${wanted}" не среди кандидатов`,
    );
  }
  if (chosen.disabled === true) {
    throw new Error(`SET_TARGETING: вариант "${wanted}" сейчас недоступен`);
  }

  targeting.picked = byCell ? chosen.cellId : byOption ? chosen.optionId : chosen.fighterId;
  return partyState;
};

/** Снимает выбор тот, кто его открыл (или тот же игрок). */
const closeTargeting = (partyState, action) => {
  const targeting = partyState.targeting;
  const playerId = playerIdOf(partyState, action);
  if (targeting && playerId != null && String(targeting.playerId) !== String(playerId)) {
    throw new Error('SET_TARGETING: это чужой выбор цели');
  }

  partyState.targeting = null;
  return partyState;
};

/**
 * SET_TARGETING — выбор цели: подсветка кандидатов и клик по одному из них.
 * Движок открывает окно (`open` с кандидатами и `count`), отмечает клик (`pick`) и закрывает окно (`close`).
 * Эффект применяет тот, кто открыл выбор, а не сам выбор.
 * params: { op: 'open' | 'pick' | 'close', playerId?, source?, candidates?, count?, required?, auto?, fighterId? }
 * `auto: true` — выбора нет: если кандидат ровно один, движок отмечает его сам и окна игрок не видит.
 */
export const SET_TARGETING = (partyState, action = {}) => {
  const op = action.op ?? 'open';
  if (op === 'open') return openTargeting(partyState, action);
  if (op === 'pick') return pickTargeting(partyState, action);
  if (op === 'close') return closeTargeting(partyState, action);
  throw new Error(`SET_TARGETING: op "${op}" (нужны open | pick | close)`);
};

export default SET_TARGETING;
