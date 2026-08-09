import { rules } from '#shared/constants/rules.js';
import { APPLY_BONUS, STANDSTILL } from '#shared/events/index.js';
import {
  assertNoPendingCombat,
  findNode,
  findOwnedFighter,
  movementBudget,
  occupiedCellIds,
} from '#shared/helpers.js';

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
 * (origin всегда в радиусе — можно вернуться.)
 */
export const movementZoneIds = (nodes, originId, radius, blocked = null) => {
  const reach = new Set(
    reachableCellIds(nodes, originId, radius, blocked).map(id => String(id)),
  );
  reach.add(String(originId));
  return reach;
};

/** Путь from→to только по клеткам радиуса перемещения (без лимита шагов). */
export const canWalkInRadius = (
  nodes,
  fromId,
  toId,
  originId,
  radius,
  blocked = null,
) => {
  if (String(fromId) === String(toId)) return true;
  const reach = movementZoneIds(nodes, originId, radius, blocked);
  if (!reach.has(String(toId)) || !reach.has(String(fromId))) return false;

  const byId = new Map(nodes.map(n => [String(n.id), n]));
  const queue = [String(fromId)];
  const seen = new Set([String(fromId)]);

  while (queue.length) {
    const id = queue.shift();
    const node = byId.get(id);
    const neighbors = Array.isArray(node?.neighbors) ? node.neighbors : [];
    for (const raw of neighbors) {
      const nextId = String(raw);
      if (seen.has(nextId) || !reach.has(nextId)) continue;
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
      bonus: 0,
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

/** Усиление перемещения: сброс карты → +bonus к радиусу (без эффектов карты). */
const applyMovementBonus = (state, action) => {
  assertNoPendingCombat(state, 'MOVE bonus');

  const player = state.players.find(p => String(p.id) === String(action.playerId));
  if (!player) {
    throw new Error(`MOVE bonus: игрок ${action.playerId} не найден`);
  }

  const cardId = action.cardId ?? action.bonusCardId;
  return APPLY_BONUS(state, { cardId, stat: 'movement' }, { player });
};

/**
 * MOVE — turn.
 * Усиление: { mode: 'bonus', cardId } — сброс карты, +card.bonus к move (1 раз).
 * Шаг: { fighterId, cellId } — в радиусе move+bonus от origins[fighter].
 * Конец: { mode: 'confirm' } — 1 AP + DRAW / EXHAUSTION.
 */
export const move = (state, action, api) => {
  if (state.hook !== 'turn') {
    throw new Error(`MOVE только в hook=turn, сейчас "${state.hook}"`);
  }

  if (action.mode === 'confirm' || action.confirm === true) {
    return confirmMovement(state, action, api);
  }

  if (action.mode === 'bonus' || action.bonusCardId != null) {
    return applyMovementBonus(state, action);
  }

  assertNoPendingCombat(state, 'MOVE');

  const fighterId = action.fighterId;
  const cellId = action.cellId;
  if (fighterId == null || cellId == null) {
    throw new Error(
      'MOVE: нужны fighterId и cellId (или mode: "confirm" | "bonus")',
    );
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
  if (fighter.currentPosition == null) {
    throw new Error(`MOVE: fighter "${fighterId}" ещё не расставлен`);
  }

  const node = findNode(state, cellId);
  if (!node) {
    throw new Error(`MOVE: клетка "${cellId}" не найдена на карте`);
  }
  if (String(fighter.currentPosition) === String(node.id)) {
    throw new Error('MOVE: fighter уже на этой клетке');
  }

  const blockedDest = occupiedCellIds(state, { exceptFighterId: fighterId });
  if (blockedDest.has(String(node.id))) {
    throw new Error(`MOVE: клетка ${cellId} занята`);
  }

  const blockedPath = occupiedCellIds(state, { exceptFighterId: fighterId });
  if (rules.canPassThroughTeammates) {
    for (const ally of player.fighters ?? []) {
      if (ally.currentPosition != null && String(ally.id) !== String(fighterId)) {
        blockedPath.delete(String(ally.currentPosition));
      }
    }
  }
  if (rules.canPassThroughEnemies) {
    for (const p of state.players ?? []) {
      if (String(p.id) === String(action.playerId)) continue;
      for (const enemy of p.fighters ?? []) {
        if (enemy.currentPosition != null) {
          blockedPath.delete(String(enemy.currentPosition));
        }
      }
    }
  }

  const movement = ensureMovement(state, action.playerId);
  const fid = String(fighterId);
  const budget = movementBudget(fighter, movement);
  if (budget <= 0) {
    throw new Error(`MOVE: у "${fighterId}" move=0`);
  }

  if (movement.origins[fid] == null) {
    movement.origins[fid] = fighter.currentPosition;
  }
  const origin = movement.origins[fid];

  const nodes = state.map?.nodes ?? [];
  if (
    !canWalkInRadius(
      nodes,
      fighter.currentPosition,
      node.id,
      origin,
      budget,
      blockedPath,
    )
  ) {
    throw new Error(
      `MOVE: клетка "${cellId}" вне радиуса move=${budget} от старта ${origin}`,
    );
  }

  player.fighters[index] = {
    ...fighter,
    currentPosition: node.id,
  };

  return state;
};

export default move;
