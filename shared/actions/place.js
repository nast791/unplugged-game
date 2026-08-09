import {
  allPlayersPlacementReady,
  findNode,
  playerFightersPlaced,
} from '#shared/helpers/placement.js';
import { findOwnedFighter } from '#shared/helpers/base.js';

/** Индекс места за столом: order (1-based) или позиция в players[]. */
export const seatIndex = (state, playerId) => {
  const player = state.players?.find(p => String(p.id) === String(playerId));
  if (!player) return -1;
  if (Number.isInteger(player.order)) return player.order - 1;
  return state.players.findIndex(p => String(p.id) === String(playerId));
};

/** Стартовая область: node.position === seatIndex + 1 */
export const isStartAreaForPlayer = (node, seatIndex) => {
  if (node?.position == null || seatIndex < 0) return false;
  return Number(node.position) === Number(seatIndex) + 1;
};

export const isHeroStartCell = node => node?.heroStart === true;

/** Клетки для ручной расстановки помощников (старт без heroStart). */
export const assistantStartCellIds = (state, playerId) => {
  const seat = seatIndex(state, playerId);
  return (state.map?.nodes ?? [])
    .filter(n => isStartAreaForPlayer(n, seat) && !isHeroStartCell(n))
    .map(n => n.id);
};

export const startAreaCellIds = (state, playerId) => {
  const seat = seatIndex(state, playerId);
  return (state.map?.nodes ?? [])
    .filter(n => isStartAreaForPlayer(n, seat))
    .map(n => n.id);
};

const maybeAdvance = state => {
  if (allPlayersPlacementReady(state)) {
    state.hook = 'turnStart';
  }
  return state;
};

const confirmPlacement = (state, player) => {
  if (player.placementReady) {
    return maybeAdvance(state);
  }
  if (!playerFightersPlaced(player)) {
    throw new Error('PLACE: сначала расставьте всех помощников');
  }
  player.placementReady = true;
  return maybeAdvance(state);
};

/**
 * PLACE — только gameStart.
 * Герои уже на heroStart (авто) — ставить/двигать нельзя.
 * Помощники: { fighterId, cellId } в стартовой области без heroStart.
 * Подтвердить: { mode: 'confirm' }
 */
export const place = (state, action) => {
  if (state.hook !== 'gameStart') {
    throw new Error(`PLACE только в hook=gameStart, сейчас "${state.hook}"`);
  }

  const player = state.players.find(p => String(p.id) === String(action.playerId));
  if (!player) {
    throw new Error(`PLACE: игрок ${action.playerId} не найден`);
  }

  if (action.mode === 'confirm' || action.confirm === true) {
    return confirmPlacement(state, player);
  }

  if (player.placementReady) {
    throw new Error('PLACE: расстановка уже подтверждена');
  }

  const fighterId = action.fighterId;
  const cellId = action.cellId;
  if (fighterId == null || cellId == null) {
    throw new Error('PLACE: нужны fighterId и cellId, либо mode: "confirm"');
  }

  const { fighter, index } = findOwnedFighter(state, action.playerId, fighterId);
  if (!fighter) {
    throw new Error(
      `PLACE: fighter "${fighterId}" не принадлежит игроку ${action.playerId}`,
    );
  }
  if (fighter.type === 'hero') {
    throw new Error(
      'PLACE: герой уже на фиксированной клетке (авторасстановка)',
    );
  }

  const node = findNode(state, cellId);
  if (!node) {
    throw new Error(`PLACE: клетка "${cellId}" не найдена на карте`);
  }
  if (
    !isStartAreaForPlayer(node, seatIndex(state, action.playerId)) ||
    isHeroStartCell(node)
  ) {
    const allowed = assistantStartCellIds(state, action.playerId).join(', ') || '—';
    throw new Error(
      `PLACE: помощникам клетки ${allowed} (не heroStart)`,
    );
  }
  if (String(fighter.currentPosition) === String(node.id)) {
    throw new Error('PLACE: fighter уже на этой клетке');
  }

  const occupiedByOwn = (player.fighters ?? []).some(
    f =>
      String(f.id) !== String(fighterId) &&
      f.currentPosition != null &&
      String(f.currentPosition) === String(node.id),
  );
  if (occupiedByOwn) {
    throw new Error(`PLACE: клетка ${cellId} уже занята вашим бойцом`);
  }

  player.fighters[index] = {
    ...fighter,
    currentPosition: node.id,
    startPosition: node.id,
  };

  return maybeAdvance(state);
};

export default place;
