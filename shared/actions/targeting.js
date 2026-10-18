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
        if (cellId == null) return null;
        // недоступная клетка остаётся кандидатом, но `SET_TARGETING pick` её отклоняет
        return {
          cellId: String(cellId),
          ...(typeof entry === 'object' && entry.disabled === true ? { disabled: true } : {}),
        };
      }

      if (kind === 'options') {
        const optionId = typeof entry === 'object' ? (entry.optionId ?? entry.id) : entry;
        if (optionId == null) return null;
        return {
          ...(typeof entry === 'object' ? entry : {}),
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
          ...(entry.disabled === true ? { disabled: true } : {}),
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

  /** Сколько целей нужно отметить (`max` — тот же счёт, если правило написано через него).
   * Одна цель — окно закрывается отметкой; несколько — окно собирает список по клику за раз. */
  const count = Number(action.count ?? action.max ?? 1);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(
      `SET_TARGETING: count — целое число целей не меньше 1 (пришло ${action.count ?? action.max})`,
    );
  }

  const kind = action.kind ?? 'fighters';
  if (!['fighters', 'cells', 'options'].includes(kind)) {
    throw new Error(`SET_TARGETING: kind "${action.kind}" (нужны fighters | cells | options)`);
  }

  const candidates = normalizeCandidates(action.candidates, kind);
  if (candidates.length === 0) {
    throw new Error('SET_TARGETING: нужны candidates (хотя бы один)');
  }

  // окно, которое нечем собрать, открывать нельзя: у обязательного не будет выхода (`required: true`)
  const available = candidates.filter(entry => entry.disabled !== true).length;
  if (count > available) {
    throw new Error(
      `SET_TARGETING: целей ${count}, а доступных кандидатов ${available} (нужно не больше)`,
    );
  }

  partyState.targeting = {
    playerId: String(playerId),
    source: action.source ?? null,
    required: action.required === true,
    // окно открыто «без выбора»: если кандидатов ровно столько, сколько просит окно, движок отметит их сам (autoPick в runRules)
    auto: action.auto === true,
    // окно-переключатель: клик только отмечает или снимает цель, применяет отметку общая кнопка (UI_OK)
    ...(action.toggle === true ? { toggle: true } : {}),
    kind,
    count,
    candidates,
    picked: null,
    // признак есть только у окон на несколько целей: у окна на одну цель отметка и есть завершение
    ...(count > 1 ? { complete: false } : {}),
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

  const key = byCell ? 'cellId' : byOption ? 'optionId' : 'fighterId';
  const id = chosen[key];

  // окно-переключатель: клик отмечает цель, повторный клик по ней же — снимает; окно ждёт общей кнопки
  if (targeting.toggle === true && Number(targeting.count) === 1) {
    targeting.picked = String(targeting.picked ?? '') === id ? null : id;
    return partyState;
  }

  // окно на несколько целей: клик добавляет цель к списку, дублей и перебора быть не может
  if (Number(targeting.count) > 1) {
    const noun = byCell ? 'клетка' : byOption ? 'вариант' : 'боец';
    const picked = Array.isArray(targeting.picked) ? targeting.picked : [];

    // у окна-переключателя повторный клик снимает отметку, даже если набор уже полон
    if (targeting.toggle === true && picked.includes(id)) {
      targeting.picked = picked.filter(entry => entry !== id);
      targeting.complete = targeting.picked.length >= Number(targeting.count);
      return partyState;
    }
    if (picked.length >= Number(targeting.count)) {
      throw new Error(`SET_TARGETING: в окне уже отмечено ${targeting.count} цели`);
    }
    if (picked.includes(id)) {
      throw new Error(`SET_TARGETING: ${noun} "${id}" уже отмечен`);
    }

    targeting.picked = [...picked, id];
    targeting.complete = targeting.picked.length >= Number(targeting.count);
    return partyState;
  }

  targeting.picked = id;
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
 * params: { op: 'open' | 'pick' | 'close', playerId?, source?, candidates?, count?, required?, auto?, toggle?, fighterId? }
 * `count` (`max` — синоним) — сколько целей отметить. Одна цель — отметка закрывает окно;
 * несколько — окно собирает список (`picked` — массив id, `complete` — набран ли весь набор):
 * закрывает такое окно общая кнопка (`UI_OK`), а `required: false` позволяет закрыть его раньше срока.
 * `auto: true` — выбора нет: если кандидатов ровно столько, сколько просит окно, движок отмечает их сам.
 * `toggle: true` — окно-переключатель: клик только отмечает цель или снимает отметку с неё,
 * а применяет выбор общая кнопка (у необязательного окна без отметки она отказывается от выбора).
 */
export const SET_TARGETING = (partyState, action = {}) => {
  const op = action.op ?? 'open';
  if (op === 'open') return openTargeting(partyState, action);
  if (op === 'pick') return pickTargeting(partyState, action);
  if (op === 'close') return closeTargeting(partyState, action);
  throw new Error(`SET_TARGETING: op "${op}" (нужны open | pick | close)`);
};

export default SET_TARGETING;
