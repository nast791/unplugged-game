import { SET_CARDS } from '#shared/actions-new/cards.js';
import { SET_FIGHTER_CELL } from '#shared/actions-new/fighter.js';
import {
  findCardInHand,
  findOwnedFighter,
  findPlayer,
} from '#shared/helpers/base.js';

const playerIdOf = (partyState, action) =>
  action.playerId ?? partyState.turn?.playerId;

const openMovement = (partyState, action) => {
  if (partyState.movement) {
    throw new Error('SET_MOVEMENT: перемещение уже открыто');
  }

  const playerId = playerIdOf(partyState, action);
  if (playerId == null) throw new Error('SET_MOVEMENT: нужен playerId');
  if (!findPlayer(partyState, playerId)) {
    throw new Error(`SET_MOVEMENT: игрок ${playerId} не найден`);
  }

  partyState.movement = {
    playerId: String(playerId),
    origins: {},
    bonus: 0,
    bonusUsed: false,
  };
  return partyState;
};

/** Шаг бойца: origin запоминается при первом шаге, радиус считается от него. */
const stepMovement = (partyState, action) => {
  const movement = partyState.movement;
  if (!movement) throw new Error('SET_MOVEMENT: перемещение не открыто');

  const playerId = playerIdOf(partyState, action);
  if (String(movement.playerId) !== String(playerId)) {
    throw new Error('SET_MOVEMENT: это чужое перемещение');
  }

  const { fighter } = findOwnedFighter(partyState, playerId, action.fighterId);
  if (!fighter) {
    throw new Error(
      `SET_MOVEMENT: боец "${action.fighterId}" не найден у игрока ${playerId}`,
    );
  }
  if (fighter.currentPosition == null) {
    throw new Error('SET_MOVEMENT: боец не расставлен');
  }

  const fighterId = String(action.fighterId);
  if (movement.origins[fighterId] == null) {
    movement.origins[fighterId] = fighter.currentPosition;
  }

  return SET_FIGHTER_CELL(partyState, {
    fighterId: action.fighterId,
    cellId: action.cellId,
  });
};

/** Усиление перемещения: карта из руки в сброс, её bonus — всему действию, один раз. */
const applyMovementBonus = (partyState, action) => {
  const movement = partyState.movement;
  if (!movement) throw new Error('SET_MOVEMENT: перемещение не открыто');

  const playerId = playerIdOf(partyState, action);
  if (String(movement.playerId) !== String(playerId)) {
    throw new Error('SET_MOVEMENT: это чужое перемещение');
  }
  if (movement.bonusUsed) {
    throw new Error('SET_MOVEMENT: усиление уже использовано');
  }
  if (action.cardId == null) throw new Error('SET_MOVEMENT: нужен cardId');

  const card = findCardInHand(findPlayer(partyState, playerId), action.cardId);
  if (!card) {
    throw new Error(`SET_MOVEMENT: карты "${action.cardId}" нет в руке`);
  }

  const amount = Number(card.bonus) || 0;
  if (amount <= 0) {
    throw new Error(`SET_MOVEMENT: у карты "${action.cardId}" нет усиления`);
  }

  SET_CARDS(partyState, {
    playerId,
    op: 'discard',
    cardIds: [action.cardId],
  });
  movement.bonus = (Number(movement.bonus) || 0) + amount;
  movement.bonusUsed = true;
  return partyState;
};

const closeMovement = (partyState, action) => {
  const movement = partyState.movement;
  const playerId = playerIdOf(partyState, action);
  if (
    movement &&
    playerId != null &&
    String(movement.playerId) !== String(playerId)
  ) {
    throw new Error('SET_MOVEMENT: это чужое перемещение');
  }

  partyState.movement = null;
  return partyState;
};

/**
 * SET_MOVEMENT — черновик перемещения: открыть, шагнуть бойцом, усилить, закрыть.
 * params: { op: 'open' | 'step' | 'bonus' | 'close', playerId?, fighterId?, cellId?, cardId? }
 */
export const SET_MOVEMENT = (partyState, action = {}) => {
  const op = action.op ?? 'open';
  if (op === 'open') return openMovement(partyState, action);
  if (op === 'step') return stepMovement(partyState, action);
  if (op === 'bonus') return applyMovementBonus(partyState, action);
  if (op === 'close') return closeMovement(partyState, action);
  throw new Error(`SET_MOVEMENT: op "${op}" (нужны open | step | bonus | close)`);
};

export default SET_MOVEMENT;
