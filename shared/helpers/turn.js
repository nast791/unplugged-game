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

/**
 * Партия завершена (живых сторон не больше одной): hook = gameEnd и winner; остальное — в gameEnd.enter.
 * Пока бой не закрыт, победа не объявляется: действие доигрывается до конца, эффекты обеих карт
 * успевают сработать, и только потом проверяется условие победы. Если в одном бою погибли все герои,
 * побеждает активный игрок (это решает finishedSides).
 */
export const endGameIfFinished = partyState => {
  if (partyState.combat) return partyState;

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

/** выбор эффекта боя, если оно открыто и ждёт решения этого игрока. */
export const combatChoiceOf = (partyState, playerId) => {
  const choice = partyState?.combat?.choice;
  if (!choice || playerId == null) return null;
  return String(choice.playerId) === String(playerId) ? choice : null;
};

/** Момент открыт и принадлежит игроку (у боя владельцев двое). */
export const isMomentMine = (partyState, playerId, name) => {  const moment = momentOf(partyState, name);
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

/** Лимит руки касается только тех, кто ещё в партии: у сдавшегося руки как бы нет. */
export const isHandOverLimit = (partyState, playerId) =>
  !findPlayer(partyState, playerId)?.resigned &&
  handCards(partyState, playerId).length > rules.maxHandSize;

export const mustDiscardCount = (partyState, playerId) =>
  Math.max(0, handCards(partyState, playerId).length - rules.maxHandSize);

/** Герои игрока — цель истощения; помощники урон не получают. */
export const heroFighterIds = player =>
  playerHeroes(player)
    .filter(fighter => Number(fighter.currentHp) > 0)
    .map(fighter => String(fighter.id));

/**
 * Радиус перемещения бойца: move + усиление текущего перемещения.
 * У перемещения от эффекта карты свой бюджет (`movement.budget`), он важнее move бойца.
 */
export const movementBudget = (fighter, movement = null) =>
  Number(movement?.budget ?? fighter?.move ?? 0) + Number(movement?.bonus || 0);

/** Бойцы, которых можно двигать в этом перемещении: список из эффекта либо все свои. */
export const movableFighterIds = (partyState, playerId) => {
  const movement = partyState?.movement;
  if (!movement || String(movement.playerId) !== String(playerId)) return [];
  if (movement.fighters == null) return [];

  const player = findPlayer(partyState, playerId);
  return (player?.fighters ?? [])
    .filter(fighter => fighter.currentPosition != null)
    .map(fighter => String(fighter.id))
    .filter(fighterId => movement.fighters.includes(fighterId));
};

/** Можно ли двигать этого бойца в текущем перемещении. */
export const canMoveFighter = (partyState, playerId, fighterId) => {
  const movement = partyState?.movement;
  if (!movement || movement.fighters == null) return true;
  return movement.fighters.includes(String(fighterId));
};

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
  // эффект карты двигает только своих бойцов из списка — чужим клетки не подсвечиваем
  if (!canMoveFighter(partyState, playerId, fighterId)) return [];

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
  if (!canMoveFighter(partyState, playerId, fighterId)) {
    return `этим эффектом двигают только своих бойцов из списка (${fighterId} не подходит)`;
  }
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
