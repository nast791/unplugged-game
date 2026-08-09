/** Общие утилиты партии (actions + events). */

export const findNode = (state, cellId) => {
  const nodes = state.map?.nodes;
  if (!Array.isArray(nodes)) return null;
  return nodes.find(n => String(n.id) === String(cellId)) ?? null;
};

export const findOwnedFighter = (state, playerId, fighterId) => {
  const player = state.players.find(p => String(p.id) === String(playerId));
  if (!player || !Array.isArray(player.fighters)) {
    return { player: null, fighter: null, index: -1 };
  }
  const index = player.fighters.findIndex(f => String(f.id) === String(fighterId));
  if (index < 0) return { player, fighter: null, index: -1 };
  return { player, fighter: player.fighters[index], index };
};

export const findFighter = (state, fighterId) => {
  for (const player of state.players ?? []) {
    if (!Array.isArray(player.fighters)) continue;
    const index = player.fighters.findIndex(f => String(f.id) === String(fighterId));
    if (index >= 0) {
      return { player, fighter: player.fighters[index], index };
    }
  }
  return { player: null, fighter: null, index: -1 };
};

/** Id области клетки = первый цвет в node.areas (одинаковый цвет = одна область). */
export const nodeAreaId = node => {
  const areas = node?.areas;
  if (!Array.isArray(areas) || areas.length === 0) return null;
  return String(areas[0]);
};

export const areaIdAtCell = (state, cellId) => {
  if (cellId == null) return null;
  return nodeAreaId(findNode(state, cellId));
};

export const livingFighters = player =>
  (player?.fighters ?? []).filter(f => Number(f.currentHp) > 0);

export const livingHeroes = player =>
  livingFighters(player).filter(f => f.type === 'hero');

export const occupiedCellIds = (state, { exceptFighterId } = {}) => {
  const set = new Set();
  for (const p of state?.players ?? []) {
    for (const fighter of p.fighters ?? []) {
      if (fighter.currentPosition == null) continue;
      if (
        exceptFighterId != null &&
        String(fighter.id) === String(exceptFighterId)
      ) {
        continue;
      }
      set.add(String(fighter.currentPosition));
    }
  }
  return set;
};

export const zoneCards = zone => {
  if (Array.isArray(zone)) return zone;
  return zone?.cards ?? [];
};

export const findInHand = (player, cardId) => {
  const hand = zoneCards(player?.hand);
  if (cardId == null) return { card: null, index: -1 };
  const key = String(cardId);
  const index = hand.findIndex(
    c => String(c.instanceId) === key || String(c.id) === key,
  );
  if (index < 0) return { card: null, index: -1 };
  return { card: hand[index], index };
};

const pushDiscard = (player, card) => {
  if (player.discard?.cards) {
    player.discard.cards.push(card);
    return;
  }
  if (Array.isArray(player.discard)) {
    player.discard.push(card);
    return;
  }
  player.discard = { visibility: [], cards: [card] };
};

export const discardFromHand = (player, cardId) => {
  const { card, index } = findInHand(player, cardId);
  if (!card) return null;
  if (player.hand?.cards) {
    player.hand.cards.splice(index, 1);
  } else if (Array.isArray(player.hand)) {
    player.hand.splice(index, 1);
  }
  pushDiscard(player, card);
  return card;
};

/** Значение УСИЛЕНИЯ карты (поле bonus, не combat value). */
export const cardBonusValue = card => Math.max(0, Number(card?.bonus) || 0);

/** Эффективный радиус перемещения: move + bonus перемещения хода. */
export const movementBudget = (fighter, movement = null) =>
  Number(fighter?.move || 0) + Number(movement?.bonus || 0);

export const assertNoPendingCombat = (state, label) => {
  if (state.combat) {
    throw new Error(`${label}: сначала завершите бой (DEFEND)`);
  }
};

export const assertNoPendingMovement = (state, label) => {
  if (state.movement) {
    throw new Error(`${label}: сначала завершите перемещение (MOVE confirm)`);
  }
};
