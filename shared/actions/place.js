import { PHASES } from '@nast791/engine/constants';
import {
  allPlayersPlacementReady,
  findNode,
  findOwnedFighter,
  playerFightersPlaced,
} from '#shared/helpers.js';

/** Стартовая область: node.position === Number(playerId) + 1 */
export const isStartAreaForPlayer = (node, playerId) => {
  if (node?.position == null) return false;
  return Number(node.position) === Number(playerId) + 1;
};

export const isHeroStartCell = node => node?.heroStart === true;

/** Клетки для ручной расстановки помощников (старт без heroStart). */
export const assistantStartCellIds = (state, playerId) =>
  (state.map?.nodes ?? [])
    .filter(n => isStartAreaForPlayer(n, playerId) && !isHeroStartCell(n))
    .map(n => n.id);

export const startAreaCellIds = (state, playerId) =>
  (state.map?.nodes ?? [])
    .filter(n => isStartAreaForPlayer(n, playerId))
    .map(n => n.id);

const maybeAdvance = state => {
  if (allPlayersPlacementReady(state)) {
    state.phase = PHASES.turnStart;
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
  if (state.phase !== PHASES.gameStart) {
    throw new Error(`PLACE только в phase=gameStart, сейчас "${state.phase}"`);
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
  if (!isStartAreaForPlayer(node, action.playerId) || isHeroStartCell(node)) {
    const allowed = assistantStartCellIds(state, action.playerId).join(', ') || '—';
    throw new Error(
      `PLACE: помощникам клетки ${allowed} (не heroStart)`,
    );
  }
  if (String(fighter.position) === String(node.id)) {
    throw new Error('PLACE: fighter уже на этой клетке');
  }

  const occupiedByOwn = (player.fighters ?? []).some(
    f =>
      String(f.id) !== String(fighterId) &&
      f.position != null &&
      String(f.position) === String(node.id),
  );
  if (occupiedByOwn) {
    throw new Error(`PLACE: клетка ${cellId} уже занята вашим бойцом`);
  }

  player.fighters[index] = {
    ...fighter,
    position: node.id,
    startPosition: node.id,
  };

  return maybeAdvance(state);
};

export default place;
