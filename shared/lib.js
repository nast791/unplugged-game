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

export const playerFightersPlaced = player => {
  if (!Array.isArray(player?.fighters) || player.fighters.length === 0) return true;
  return player.fighters.every(f => f.position != null);
};

export const allPlayersPlacementReady = state =>
  (state.players ?? []).every(p => {
    if (!Array.isArray(p.fighters) || p.fighters.length === 0) return true;
    return p.placementReady === true && playerFightersPlaced(p);
  });

export const livingFighters = player =>
  (player?.fighters ?? []).filter(f => Number(f.currentHp) > 0);

export const livingHeroes = player =>
  livingFighters(player).filter(f => f.type === 'hero');

export const occupiedCellIds = (state, { exceptFighterId } = {}) => {
  const set = new Set();
  for (const player of state?.players ?? []) {
    for (const fighter of player.fighters ?? []) {
      if (fighter.position == null) continue;
      if (
        exceptFighterId != null &&
        String(fighter.id) === String(exceptFighterId)
      ) {
        continue;
      }
      set.add(String(fighter.position));
    }
  }
  return set;
};

export const findInHand = (player, cardId) => {
  const hand = player?.hand;
  if (!Array.isArray(hand) || cardId == null) {
    return { card: null, index: -1 };
  }
  const key = String(cardId);
  const index = hand.findIndex(
    c => String(c.instanceId) === key || String(c.id) === key,
  );
  if (index < 0) return { card: null, index: -1 };
  return { card: hand[index], index };
};

export const discardFromHand = (player, cardId) => {
  const { card, index } = findInHand(player, cardId);
  if (!card) return null;
  player.hand.splice(index, 1);
  if (!Array.isArray(player.discard)) player.discard = [];
  player.discard.push(card);
  return card;
};

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
