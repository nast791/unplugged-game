/** Геометрия поля: расстояния по neighbors, радиус перемещения и путь внутри радиуса. */

const indexNodes = nodes => new Map((nodes ?? []).map(node => [String(node.id), node]));

/** Кратчайший путь по neighbors с отсечением по maxSteps; blocked — непроходимые клетки. */
export const bfsDistance = (nodes, fromId, toId, maxSteps, blocked = null) => {
  if (String(fromId) === String(toId)) return 0;

  const byId = indexNodes(nodes);
  if (!byId.has(String(fromId)) || !byId.has(String(toId))) return Infinity;

  const queue = [{ id: String(fromId), distance: 0 }];
  const seen = new Set([String(fromId)]);

  while (queue.length) {
    const { id, distance } = queue.shift();
    if (distance >= maxSteps) continue;

    const neighbors = byId.get(id)?.neighbors ?? [];
    for (const raw of neighbors) {
      const nextId = String(raw);
      if (seen.has(nextId) || blocked?.has(nextId)) continue;

      const nextDistance = distance + 1;
      if (nextId === String(toId)) return nextDistance;
      seen.add(nextId);
      queue.push({ id: nextId, distance: nextDistance });
    }
  }

  return Infinity;
};

/** Свободные клетки в радиусе maxSteps от from, не включая from. */
export const reachableCellIds = (nodes, fromId, maxSteps, blocked = null) => {
  const steps = Number(maxSteps) || 0;
  if (steps <= 0 || fromId == null || !Array.isArray(nodes)) return [];

  const byId = indexNodes(nodes);
  if (!byId.has(String(fromId))) return [];

  const out = [];
  const queue = [{ id: String(fromId), distance: 0 }];
  const seen = new Set([String(fromId)]);

  while (queue.length) {
    const { id, distance } = queue.shift();
    if (distance >= steps) continue;

    const neighbors = byId.get(id)?.neighbors ?? [];
    for (const raw of neighbors) {
      const nextId = String(raw);
      if (seen.has(nextId) || blocked?.has(nextId)) continue;

      const next = byId.get(nextId);
      if (!next) continue;
      seen.add(nextId);
      out.push(next.id);
      queue.push({ id: nextId, distance: distance + 1 });
    }
  }

  return out;
};

/** Зона перемещения: origin + все свободные клетки в радиусе (origin всегда внутри — можно вернуться). */
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

  const byId = indexNodes(nodes);
  const queue = [String(fromId)];
  const seen = new Set([String(fromId)]);

  while (queue.length) {
    const id = queue.shift();
    const neighbors = byId.get(id)?.neighbors ?? [];
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
