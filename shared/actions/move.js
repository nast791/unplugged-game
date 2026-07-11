import { PHASES } from '@nast791/engine/constants';
import { STANDSTILL } from '#shared/events/index.js';
import {
  assertNoPendingCombat,
  findNode,
  findOwnedFighter,
  occupiedCellIds,
} from '#shared/lib.js';

/**
 * Кратчайший путь по neighbors, с отсечением по maxSteps.
 * blocked — непроходимые клетки (занятые бойцами); опционально.
 */
export const bfsDistance = (nodes, fromId, toId, maxSteps, blocked = null) => {
  if (String(fromId) === String(toId)) return 0;
  const byId = new Map(nodes.map(n => [String(n.id), n]));
  if (!byId.has(String(fromId)) || !byId.has(String(toId))) return Infinity;

  const queue = [{ id: String(fromId), dist: 0 }];
  const seen = new Set([String(fromId)]);

  while (queue.length) {
    const { id, dist } = queue.shift();
    if (dist >= maxSteps) continue;
    const node = byId.get(id);
    const neighbors = Array.isArray(node?.neighbors) ? node.neighbors : [];
    for (const raw of neighbors) {
      const nextId = String(raw);
      if (seen.has(nextId)) continue;
      if (blocked?.has(nextId)) continue;
      const nextDist = dist + 1;
      if (nextId === String(toId)) return nextDist;
      seen.add(nextId);
      queue.push({ id: nextId, dist: nextDist });
    }
  }
  return Infinity;
};

/** Свободные клетки в радиусе maxSteps от from (не включая from). */
export const reachableCellIds = (nodes, fromId, maxSteps, blocked = null) => {
  const steps = Number(maxSteps) || 0;
  if (steps <= 0 || fromId == null || !Array.isArray(nodes)) return [];

  const byId = new Map(nodes.map(n => [String(n.id), n]));
  if (!byId.has(String(fromId))) return [];

  const out = [];
  const queue = [{ id: String(fromId), dist: 0 }];
  const seen = new Set([String(fromId)]);

  while (queue.length) {
    const { id, dist } = queue.shift();
    if (dist >= steps) continue;
    const node = byId.get(id);
    const neighbors = Array.isArray(node?.neighbors) ? node.neighbors : [];
    for (const raw of neighbors) {
      const nextId = String(raw);
      if (seen.has(nextId)) continue;
      if (blocked?.has(nextId)) continue;
      seen.add(nextId);
      const next = byId.get(nextId);
      if (!next) continue;
      out.push(next.id);
      queue.push({ id: nextId, dist: dist + 1 });
    }
  }
  return out;
};

/**
 * Зона перемещения: origin + все свободные клетки в радиусе move.
 * (origin всегда в зоне — можно вернуться.)
 */
export const movementZoneIds = (nodes, originId, radius, blocked = null) => {
  const zone = new Set(
    reachableCellIds(nodes, originId, radius, blocked).map(id => String(id)),
  );
  zone.add(String(originId));
  return zone;
};

/** Путь from→to только по клеткам зоны радиуса (без лимита шагов). */
export const canWalkInRadius = (
  nodes,
  fromId,
  toId,
  originId,
  radius,
  blocked = null,
) => {
  if (String(fromId) === String(toId)) return true;
  const zone = movementZoneIds(nodes, originId, radius, blocked);
  if (!zone.has(String(toId)) || !zone.has(String(fromId))) return false;

  const byId = new Map(nodes.map(n => [String(n.id), n]));
  const queue = [String(fromId)];
  const seen = new Set([String(fromId)]);

  while (queue.length) {
    const id = queue.shift();
    const node = byId.get(id);
    const neighbors = Array.isArray(node?.neighbors) ? node.neighbors : [];
    for (const raw of neighbors) {
      const nextId = String(raw);
      if (seen.has(nextId) || !zone.has(nextId)) continue;
      if (nextId === String(toId)) return true;
      seen.add(nextId);
      queue.push(nextId);
    }
  }
  return false;
};

const ensureMovement = (state, playerId) => {
  if (!state.movement) {
    state.movement = {
      playerId: String(playerId),
      origins: {},
    };
    return state.movement;
  }
  if (String(state.movement.playerId) !== String(playerId)) {
    throw new Error(
      `MOVE: перемещение игрока ${state.movement.playerId}, сейчас ${playerId}`,
    );
  }
  if (!state.movement.origins) state.movement.origins = {};
  return state.movement;
};

/**
 * Конец перемещения / мув на месте → STANDSTILL.
 * Без открытого movement — «на месте» (0 шагов).
 */
const confirmMovement = (state, action, api) => {
  const movement = state.movement;
  if (movement && String(movement.playerId) !== String(action.playerId)) {
    throw new Error('MOVE confirm: это не ваше перемещение');
  }

  const player = state.players.find(p => String(p.id) === String(action.playerId));
  if (!player) {
    throw new Error(`MOVE confirm: игрок ${action.playerId} не найден`);
  }

  return STANDSTILL(state, {}, { player, api });
};

/**
 * MOVE — turn.
 * Шаг: { fighterId, cellId } — в радиусе move от origins[fighter]
 *   (фиксируется при первом шаге); внутри зоны — сколько угодно, можно назад.
 * Конец: { mode: 'confirm' } — 1 AP + DRAW_CARDS(1) или EXHAUSTION при пустой колоде.
 */
export const move = (state, action, api) => {
  if (state.phase !== PHASES.turn) {
    throw new Error(`MOVE только в phase=turn, сейчас "${state.phase}"`);
  }
  assertNoPendingCombat(state, 'MOVE');

  if (action.mode === 'confirm' || action.confirm === true) {
    return confirmMovement(state, action, api);
  }

  const fighterId = action.fighterId;
  const cellId = action.cellId;
  if (fighterId == null || cellId == null) {
    throw new Error('MOVE: нужны fighterId и cellId (или mode: "confirm")');
  }

  const { player, fighter, index } = findOwnedFighter(
    state,
    action.playerId,
    fighterId,
  );
  if (!player || !fighter) {
    throw new Error(
      `MOVE: fighter "${fighterId}" не принадлежит игроку ${action.playerId}`,
    );
  }
  if (fighter.position == null) {
    throw new Error(`MOVE: fighter "${fighterId}" ещё не расставлен`);
  }

  const node = findNode(state, cellId);
  if (!node) {
    throw new Error(`MOVE: клетка "${cellId}" не найдена на карте`);
  }
  if (String(fighter.position) === String(node.id)) {
    throw new Error('MOVE: fighter уже на этой клетке');
  }

  const blocked = occupiedCellIds(state, { exceptFighterId: fighterId });
  if (blocked.has(String(node.id))) {
    throw new Error(`MOVE: клетка ${cellId} занята`);
  }

  const movement = ensureMovement(state, action.playerId);
  const fid = String(fighterId);
  const budget =
    Number(fighter.move || 0) + Number(fighter.bonusMovement || 0);
  if (budget <= 0) {
    throw new Error(`MOVE: у "${fighterId}" move=0`);
  }

  if (movement.origins[fid] == null) {
    movement.origins[fid] = fighter.position;
  }
  const origin = movement.origins[fid];

  const nodes = state.map?.nodes ?? [];
  if (
    !canWalkInRadius(
      nodes,
      fighter.position,
      node.id,
      origin,
      budget,
      blocked,
    )
  ) {
    throw new Error(
      `MOVE: клетка "${cellId}" вне радиуса move=${budget} от старта ${origin}`,
    );
  }

  player.fighters[index] = {
    ...fighter,
    position: node.id,
  };

  return state;
};

export default move;
