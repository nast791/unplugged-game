import { rules } from '#shared/constants/rules.js';
import { finishedSides } from '#shared/facts-new/players.js';
import { movementZoneIds } from '#shared/helpers/board.js';
import {
  findOwnedFighter,
  findPlayer,
  playerHeroes,
  zoneCards,
} from '#shared/helpers/base.js';
import { cardBonus, cardKey } from '#shared/helpers/cards.js';
import { findNode } from '#shared/helpers/placement.js';

/** Активный игрок хода. */
export const activePlayerId = partyState => partyState.turn?.playerId ?? null;

export const isActivePlayer = (partyState, playerId) =>
  activePlayerId(partyState) != null &&
  String(activePlayerId(partyState)) === String(playerId);

/** Есть ли чем объявлять действие. */
export const hasActions = partyState =>
  (Number(partyState.turn?.actionsLeft) || 0) > 0;

/** Партия завершена (живых сторон не больше одной): hook = gameEnd и winner; остальное — в gameEnd.enter. */
export const endGameIfFinished = partyState => {
  const { finished, winner } = finishedSides(partyState);
  if (!finished) return partyState;

  partyState.hook = 'gameEnd';
  partyState.winner = winner;
  return partyState;
};

/** Момент хода по имени: movement | combat | targeting. */
export const momentOf = (partyState, name) => partyState?.[name] ?? null;

export const hasMoment = partyState =>
  Boolean(partyState?.movement || partyState?.combat || partyState?.targeting);

/** Объявленное действие в работе: перемещение или бой. Выбор цели объявить действие не мешает. */
export const hasAction = partyState =>
  Boolean(partyState?.movement || partyState?.combat);

/** Выбор цели открыт и открыт этим игроком. */
export const isTargetingMine = (partyState, playerId) => {
  const targeting = partyState?.targeting;
  return (
    Boolean(targeting) && String(targeting.playerId) === String(playerId)
  );
};

/** Кандидаты выбора цели, если выбор открыт этим игроком. */
export const targetingCandidates = (partyState, playerId) =>
  isTargetingMine(partyState, playerId)
    ? (partyState.targeting.candidates ?? []).map(entry =>
        String(entry.fighterId),
      )
    : [];

/** Момент открыт и принадлежит игроку (у боя владельцев двое). */
export const isMomentMine = (partyState, playerId, name) => {
  const moment = momentOf(partyState, name);
  if (!moment) return false;

  const owners =
    name === 'combat'
      ? [moment.attackerPlayerId, moment.defenderPlayerId]
      : [moment.playerId];

  return owners.some(
    owner => owner != null && String(owner) === String(playerId),
  );
};

export const handCards = (partyState, playerId) =>
  zoneCards(findPlayer(partyState, playerId)?.hand);

export const handCardIds = (partyState, playerId) =>
  handCards(partyState, playerId).map(cardKey);

/** Карты руки с усилением (поле bonus). */
export const bonusCardIds = (partyState, playerId) =>
  handCards(partyState, playerId)
    .filter(card => cardBonus(card) > 0)
    .map(cardKey);

export const isHandOverLimit = (partyState, playerId) =>
  handCards(partyState, playerId).length > rules.maxHandSize;

export const mustDiscardCount = (partyState, playerId) =>
  Math.max(0, handCards(partyState, playerId).length - rules.maxHandSize);

/** Герои игрока — цель истощения; помощники урон не получают. */
export const heroFighterIds = player =>
  playerHeroes(player)
    .filter(fighter => Number(fighter.currentHp) > 0)
    .map(fighter => String(fighter.id));

/** Радиус перемещения бойца: move + усиление текущего перемещения. */
export const movementBudget = (fighter, movement = null) =>
  Number(fighter?.move || 0) + Number(movement?.bonus || 0);

/** Занятые клетки; exceptFighterId исключается. */
export const occupiedCellIds = (partyState, exceptFighterId = null) => {
  const blocked = new Set();
  for (const player of partyState?.players ?? []) {
    for (const fighter of player.fighters ?? []) {
      if (fighter.currentPosition == null) continue;
      if (
        exceptFighterId != null &&
        String(fighter.id) === String(exceptFighterId)
      ) {
        continue;
      }
      blocked.add(String(fighter.currentPosition));
    }
  }
  return blocked;
};

/** Непроходимые клетки для шага: сквозь своих можно, если rules.canPassThroughTeammates. */
export const blockedCellsForStep = (partyState, player, fighterId) => {
  const blocked = occupiedCellIds(partyState, fighterId);
  if (rules.canPassThroughTeammates) {
    for (const fighter of player?.fighters ?? []) {
      if (String(fighter.id) === String(fighterId)) continue;
      if (fighter.currentPosition != null) {
        blocked.delete(String(fighter.currentPosition));
      }
    }
  }
  if (rules.canPassThroughEnemies) {
    for (const other of partyState.players ?? []) {
      if (String(other.id) === String(player?.id)) continue;
      for (const fighter of other.fighters ?? []) {
        if (fighter.currentPosition != null) {
          blocked.delete(String(fighter.currentPosition));
        }
      }
    }
  }
  return blocked;
};

/** Числовые id клеток — по возрастанию, остальные — по алфавиту: подсветка стабильна. */
const byCellId = (left, right) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right));
};

/**
 * Клетки, куда боец может шагнуть в текущем перемещении.
 * Радиус считается от origins бойца: за одно действие он уходит не дальше своего радиуса.
 */
export const movementDestinations = (partyState, playerId, fighterId) => {
  const movement = partyState?.movement;
  const player = findPlayer(partyState, playerId);
  if (!movement || String(movement.playerId) !== String(playerId) || !player) {
    return [];
  }

  const { fighter } = findOwnedFighter(partyState, playerId, fighterId);
  if (!fighter || fighter.currentPosition == null) return [];

  const budget = movementBudget(fighter, movement);
  if (budget <= 0) return [];

  const origin =
    movement.origins?.[String(fighterId)] ?? fighter.currentPosition;
  const reach = movementZoneIds(
    partyState.map?.nodes ?? [],
    origin,
    budget,
    blockedCellsForStep(partyState, player, fighterId),
  );
  const occupied = occupiedCellIds(partyState, fighterId);

  return [...reach]
    .map(String)
    .filter(
      cellId =>
        cellId !== String(fighter.currentPosition) && !occupied.has(cellId),
    )
    .sort(byCellId);
};

/** Почему шаг невозможен; null — можно. */
export const movementRejection = (partyState, playerId, fighterId, cellId) => {
  if (cellId == null) return 'нужна клетка';
  if (!findNode(partyState, cellId)) {
    return `клетка ${cellId} не найдена на карте`;
  }

  const movement = partyState?.movement;
  if (!movement) return 'перемещение не открыто';
  if (String(movement.playerId) !== String(playerId)) {
    return 'это чужое перемещение';
  }

  const { fighter } = findOwnedFighter(partyState, playerId, fighterId);
  if (!fighter) return `боец ${fighterId} не ваш`;
  if (fighter.currentPosition == null) return 'боец не расставлен';
  if (String(fighter.currentPosition) === String(cellId)) {
    return 'боец уже на этой клетке';
  }

  const destinations = movementDestinations(partyState, playerId, fighterId);
  if (destinations.length === 0) {
    return `у бойца ${fighterId} нет доступных клеток`;
  }
  if (!destinations.includes(String(cellId))) {
    return occupiedCellIds(partyState, fighterId).has(String(cellId))
      ? `клетка ${cellId} занята`
      : `клетка ${cellId} вне радиуса перемещения`;
  }

  return null;
};
