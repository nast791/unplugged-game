import { findPlayer } from '#shared/helpers/base.js';

const playerIdOf = (partyState, action) =>
  action.playerId ?? partyState.turn?.playerId;

/** Кандидаты — объекты бойцов (как отдаёт факт FIGHTERS) или просто id. */
const normalizeCandidates = candidates => {
  const list = Array.isArray(candidates) ? candidates : [];

  return list
    .map(entry => {
      if (entry == null) return null;
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

  const candidates = normalizeCandidates(action.candidates);
  if (candidates.length === 0) {
    throw new Error('SET_TARGETING: нужны candidates (хотя бы один)');
  }

  partyState.targeting = {
    playerId: String(playerId),
    source: action.source ?? null,
    required: action.required === true,
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

  const chosen = targeting.candidates.find(
    entry => String(entry.fighterId) === String(action.fighterId),
  );
  if (!chosen) {
    throw new Error(
      `SET_TARGETING: боец "${action.fighterId}" не среди кандидатов`,
    );
  }

  targeting.picked = chosen.fighterId;
  return partyState;
};

/** Снимает выбор тот, кто его открыл (или тот же игрок). */
const closeTargeting = (partyState, action) => {
  const targeting = partyState.targeting;
  const playerId = playerIdOf(partyState, action);
  if (
    targeting &&
    playerId != null &&
    String(targeting.playerId) !== String(playerId)
  ) {
    throw new Error('SET_TARGETING: это чужой выбор цели');
  }

  partyState.targeting = null;
  return partyState;
};

/**
 * SET_TARGETING — выбор цели: подсветка кандидатов и клик по одному из них.
 * Эффект применяет тот, кто открыл выбор, а не сам выбор.
 * params: { op: 'open' | 'pick' | 'close', playerId?, source?, candidates?, required?, fighterId? }
 */
export const SET_TARGETING = (partyState, action = {}) => {
  const op = action.op ?? 'open';
  if (op === 'open') return openTargeting(partyState, action);
  if (op === 'pick') return pickTargeting(partyState, action);
  if (op === 'close') return closeTargeting(partyState, action);
  throw new Error(`SET_TARGETING: op "${op}" (нужны open | pick | close)`);
};

export default SET_TARGETING;
