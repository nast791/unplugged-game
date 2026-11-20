import { rules } from '#shared/constants/rules.js';
import { blockingStatus } from '#shared/constants/statuses.js';
import { finishedSides } from '#shared/facts/players.js';
import { movementZoneIds } from '#shared/helpers/board.js';
import { findFighter, findOwnedFighter, findPlayer, zoneCards } from '#shared/helpers/base.js';
import { cardBonus, cardKey } from '#shared/helpers/cards.js';
import { findNode } from '#shared/helpers/placement.js';

/** Активный игрок хода. */
export const activePlayerId = partyState => partyState.turn?.playerId ?? null;

export const isActivePlayer = (partyState, playerId) =>
  activePlayerId(partyState) != null && String(activePlayerId(partyState)) === String(playerId);

/** Есть ли чем объявлять действие. */
export const hasActions = partyState => (Number(partyState.turn?.actionsLeft) || 0) > 0;

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
  Boolean(
    partyState?.movement ||
    partyState?.combat ||
    partyState?.targeting ||
    // итог битвы, который ещё не закрыт окном: действие не закончено, ход не передаётся
    partyState?.awaitingBattleClose,
  );

/** Объявленное действие в работе: перемещение или бой. Выбор цели объявить действие не мешает. */
export const hasAction = partyState => Boolean(partyState?.movement || partyState?.combat);

/**
 * Действие объявлено, но ещё не закончено: списанную единицу счётчик карточки показывает только после
 * завершения. Перемещение от эффекта (`movement.source`) — не объявленное действие, его карта уже заплатила.
 */
export const pendingActionCount = partyState => {
  const { effect, combat, movement, awaitingBattleClose } = partyState ?? {};
  // итог битвы ждёт кнопки «Закрыть»: единица действия ещё не списана — её видно на счётчике
  return effect || combat || awaitingBattleClose || (movement && movement.source == null) ? 1 : 0;
};

/** Выбор цели открыт и открыт этим игроком. */
export const isTargetingMine = (partyState, playerId) => {
  const targeting = partyState?.targeting;
  return Boolean(targeting) && String(targeting.playerId) === String(playerId);
};

/** Кандидаты выбора цели, если выбор открыт этим игроком. */
export const targetingCandidates = (partyState, playerId) =>
  isTargetingMine(partyState, playerId)
    ? (partyState.targeting.candidates ?? []).map(entry => String(entry.fighterId))
    : [];

/** выбор эффекта боя, если оно открыто и ждёт решения этого игрока. */
export const combatChoiceOf = (partyState, playerId) => {
  const choice = partyState?.combat?.choice;
  if (!choice || playerId == null) return null;
  return String(choice.playerId) === String(playerId) ? choice : null;
};

/** Момент открыт и принадлежит игроку (у боя владельцев двое). */
export const isMomentMine = (partyState, playerId, name) => {
  const moment = momentOf(partyState, name);
  if (!moment) return false;

  const owners =
    name === 'combat' ? [moment.attackerPlayerId, moment.defenderPlayerId] : [moment.playerId];

  return owners.some(owner => owner != null && String(owner) === String(playerId));
};

export const handCards = (partyState, playerId) =>
  zoneCards(findPlayer(partyState, playerId)?.hand);

export const handCardIds = (partyState, playerId) => handCards(partyState, playerId).map(cardKey);

/** Карты руки с усилением (поле bonus). */
export const bonusCardIds = (partyState, playerId) =>
  handCards(partyState, playerId)
    .filter(card => cardBonus(card) > 0)
    .map(cardKey);

/**
 * Лимит руки игрока: общий `rules.maxHandSize`, если герой не поменял его правилом
 * `SET_HAND_LIMIT` (например, «Вечная мерзлота» Снежной королевы держит врагов на пяти картах).
 * Значение живёт на игроке (`player.handLimit`), его ставит и снимает само правило.
 */
export const handLimitFor = (partyState, playerId) =>
  Number(findPlayer(partyState, playerId)?.handLimit ?? rules.maxHandSize);

/** Лимит руки касается только тех, кто ещё в партии: у сдавшегося руки как бы нет. */
export const isHandOverLimit = (partyState, playerId) =>
  !findPlayer(partyState, playerId)?.resigned &&
  handCards(partyState, playerId).length > handLimitFor(partyState, playerId);

export const mustDiscardCount = (partyState, playerId) =>
  Math.max(0, handCards(partyState, playerId).length - handLimitFor(partyState, playerId));

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

  // список из правила важнее владельца: принудительное перемещение двигает чужих бойцов
  return (movement.fighters ?? []).map(String).filter(fighterId => {
    const fighter = findFighter(partyState, fighterId)?.fighter;
    if (fighter == null || fighter.currentPosition == null) return false;
    // замороженный в списке есть, но шаг ему закрыт — подсвечивать его нельзя (см. movementDestinations)
    return movementFighterRejection(partyState, movement, playerId, fighterId) == null;
  });
};

/** Занятые клетки; exceptFighterId исключается. */
export const occupiedCellIds = (partyState, exceptFighterId = null) => {
  const blocked = new Set();
  for (const player of partyState?.players ?? []) {
    for (const fighter of player.fighters ?? []) {
      if (fighter.currentPosition == null) continue;
      if (exceptFighterId != null && String(fighter.id) === String(exceptFighterId)) {
        continue;
      }
      blocked.add(String(fighter.currentPosition));
    }
  }
  return blocked;
};

/**
 * Непроходимые клетки для шага: сквозь своих можно, если rules.canPassThroughTeammates,
 * сквозь врагов — если rules.canPassThroughEnemies или сам эффект разрешил проход (movement.throughEnemies).
 * Конечная клетка всё равно должна быть свободной — это проверяет movementDestinations.
 */
export const blockedCellsForStep = (partyState, player, fighterId, movement = null) => {
  const blocked = occupiedCellIds(partyState, fighterId);
  if (rules.canPassThroughTeammates) {
    for (const fighter of player?.fighters ?? []) {
      if (String(fighter.id) === String(fighterId)) continue;
      if (fighter.currentPosition != null) {
        blocked.delete(String(fighter.currentPosition));
      }
    }
  }
  if (rules.canPassThroughEnemies || movement?.throughEnemies === true) {
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
 * Боец для черновика перемещения: если правило задало список бойцов (`movement.fighters`),
 * двигать можно ровно их — даже чужих (принудительное перемещение). Иначе — только свои.
 */
export const draftFighter = (partyState, movement, playerId, fighterId) => {
  if (!movement || fighterId == null) return null;

  if (movement.fighters != null) {
    if (!movement.fighters.map(String).includes(String(fighterId))) return null;
    return findFighter(partyState, fighterId)?.fighter ?? null;
  }

  return findOwnedFighter(partyState, playerId, fighterId)?.fighter ?? null;
};

/**
 * Почему бойца нельзя двигать этим черновиком; null — можно.
 * Без списка бойцов двигают только своих; со списком — ровно тех, кого назвало правило
 * (так работает принудительное перемещение чужих бойцов).
 */
export const movementFighterRejection = (partyState, movement, playerId, fighterId) => {
  if (!movement) return 'перемещение не открыто';
  if (fighterId == null) return 'нужен боец';

  // статус — это про бойца, а не про владельца: двигать его нельзя ни своим ходом, ни чужим эффектом
  if (blockingStatus(findFighter(partyState, fighterId)?.fighter, 'move') != null) {
    return `боец ${fighterId} заморожен`;
  }

  if (movement.fighters == null) {
    return findOwnedFighter(partyState, playerId, fighterId).fighter
      ? null
      : `боец ${fighterId} не ваш`;
  }

  if (!movement.fighters.map(String).includes(String(fighterId))) {
    return `этим перемещением двигают только бойцов из списка (${fighterId} не подходит)`;
  }

  return draftFighter(partyState, movement, playerId, fighterId)
    ? null
    : `боец ${fighterId} не найден`;
};

/**
 * Клетки, куда боец может шагнуть в текущем перемещении.
 * Радиус считается от origins бойца: за одно действие он уходит не дальше своего радиуса.
 *
 * **Пошаговое наступление** (`stepwise`, карты с проходом сквозь врагов): подсветка — только соседние
 * клетки, и она пересчитывается после каждого шага. Бюджет считает **шаги**, а не расстояние от начала,
 * поэтому «туда и обратно» разрешено: боец может вернуться в исходную клетку. На клетку врага встать
 * можно (проход сквозь), но только если остаётся шаг на выход — закончить перемещение там нельзя.
 */
export const movementDestinations = (partyState, playerId, fighterId) => {
  const movement = partyState?.movement;
  const player = findPlayer(partyState, playerId);
  if (!movement || String(movement.playerId) !== String(playerId) || !player) {
    return [];
  }

  const fighter = draftFighter(partyState, movement, playerId, fighterId);
  if (!fighter || fighter.currentPosition == null) return [];

  // Подсветка не имеет права звать туда, куда движок не пустит: `movementRejection` первым делом
  // спрашивает то же самое, и «заморожен» закрывает шаг. Без этой проверки бойцу со статусом
  // подсвечивались клетки, а клик по ним падал («PICK: боец … заморожен»).
  if (movementFighterRejection(partyState, movement, playerId, fighterId)) return [];

  const budget = movementBudget(fighter, movement);
  const occupied = occupiedCellIds(partyState, fighterId);

  if (movement.stepwise === true) {
    const remaining = budget - movementStepsOf(movement, fighterId);

    return remaining <= 0
      ? []
      : stepDestinationCells(partyState, playerId, fighter, occupied, remaining);
  }

  // «один из двух»: прежний боец вернётся на исходную, поэтому его нынешняя клетка освободится, а
  // исходная станет занятой. Подсветка обязана это учитывать, иначе клик упадёт на возвращённом бойце.
  const activeId = movement.oneOf === true ? movement.activeFighterId : null;
  if (activeId != null && String(activeId) !== String(fighterId)) {
    const moves = (movement.moves ?? []).filter(
      move => String(move.fighterId) === String(activeId),
    );
    const home = movement.origins?.[String(activeId)] ?? moves[0]?.from;
    if (moves.length > 0) occupied.delete(String(moves[moves.length - 1].to));
    if (home != null) occupied.add(String(home));
  }

  if (budget <= 0) return [];

  const origin = movement.origins?.[String(fighterId)] ?? fighter.currentPosition;
  const blocked = blockedCellsForStep(partyState, player, fighterId, movement);
  const nodes = partyState.map?.nodes ?? [];
  const reach = movementZoneIds(nodes, origin, budget, blocked);

  // Обычное перемещение (без прохода сквозь врагов): занятые клетки — не цель, встать на них нельзя.
  // Проход сквозь врагов идёт пошагово и считается выше (`stepwise`), там своя подсветка.
  const cells = [...reach].map(String).filter(cellId => {
    if (cellId === String(fighter.currentPosition)) return false;
    return !occupied.has(cellId);
  });

  return [...new Set(cells)].sort(byCellId);
};

/** Сколько одношаговых шагов боец уже сделал в этом перемещении (для `stepwise`-бюджета). */
export const movementStepsOf = (movement, fighterId) =>
  (movement?.moves ?? []).filter(move => String(move.fighterId) === String(fighterId)).length;

/** Владелец бойца, стоящего на клетке; null — клетка свободна. */
export const cellOwnerId = (partyState, cellId) => {
  for (const player of partyState?.players ?? []) {
    for (const fighter of player.fighters ?? []) {
      if (fighter.currentPosition != null && String(fighter.currentPosition) === String(cellId)) {
        return String(player.id);
      }
    }
  }
  return null;
};

/**
 * Соседние клетки для пошагового шага: свободные и **занятые** — сквозь своего бойца проходить можно так
 * же, как сквозь врага (`rules.canPassThroughTeammates: true`). На занятой клетке нельзя остановиться,
 * поэтому она доступна, только если после неё остаётся **легальный выход** — иначе окно запиралось бы
 * без единого действия (боец стоит на чужой клетке, а уйти некуда).
 *
 * Пока боец стоит на клетке вместе с другим, это **транзит**: двигается только он, и проверка инварианта
 * в `bot/play/duel.js` такое совмещение разрешает (m02680).
 */
const stepDestinationCells = (partyState, playerId, fighter, occupied, remaining) => {
  void playerId;
  const here = String(fighter.currentPosition);
  const neighbours = (findNode(partyState, here)?.neighbors ?? []).map(String);

  // выход после шага: любая свободная соседняя клетка или наша собственная — она освободится,
  // когда боец с неё уйдёт
  const hasExit = cellId => {
    if (remaining - 1 < 1) return false;

    return (findNode(partyState, cellId)?.neighbors ?? [])
      .map(String)
      .some(
        neighbour =>
          neighbour !== String(cellId) && (!occupied.has(neighbour) || neighbour === here),
      );
  };

  const cells = neighbours.filter(cellId => {
    if (cellId === here) return false;
    if (!occupied.has(cellId)) return true;

    // занятая клетка — только транзит: своя или чужая, всё равно (m02680). Войти можно, если остаётся
    // шаг на выход; остановиться и закончить перемещение там нельзя
    return remaining >= 2 && hasExit(cellId);
  });

  return [...new Set(cells)].sort(byCellId);
};
/**
 * Стоит ли кто-то из двигаемых бойцов на клетке, занятой другим бойцом. Проход сквозь врага — не место
 * для остановки: пока боец на чужой клетке, закончить перемещение нельзя.
 */
export const movementOnOccupiedCell = (partyState, playerId) => {
  const movement = partyState?.movement;
  if (!movement || String(movement.playerId) !== String(playerId)) return false;

  const moved = new Set((movement.moves ?? []).map(move => String(move.fighterId)));
  for (const fighterId of moved) {
    const fighter = findFighter(partyState, fighterId)?.fighter;
    if (!fighter || fighter.currentPosition == null) continue;
    if (occupiedCellIds(partyState, fighterId).has(String(fighter.currentPosition))) return true;
  }

  return false;
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

  const fighter = draftFighter(partyState, movement, playerId, fighterId);
  const fighterReason = movementFighterRejection(partyState, movement, playerId, fighterId);
  if (fighterReason) return fighterReason;
  if (fighter.currentPosition == null) return 'боец не расставлен';
  if (String(fighter.currentPosition) === String(cellId)) {
    return 'боец уже на этой клетке';
  }

  const destinations = movementDestinations(partyState, playerId, fighterId);
  if (destinations.length === 0) {
    return `у бойца ${fighterId} нет доступных клеток`;
  }
  if (!destinations.includes(String(cellId))) {
    if (movement.stepwise === true) {
      // пошаговый шаг: объясняем не «радиус», а что именно не так с соседней клеткой
      const neighbour = (findNode(partyState, fighter.currentPosition)?.neighbors ?? [])
        .map(String)
        .includes(String(cellId));
      if (!neighbour) {
        return `клетка ${cellId} не соседняя: в этом перемещении шаг идёт по одной клетке`;
      }
      // клетка врага проходима, но только с запасом шага на выход; клетка своего бойца закрыта —
      // совмещение двоих на одной клетке ждёт отдельной проработки
      const owner = cellOwnerId(partyState, cellId);
      if (owner != null && owner === String(playerId)) {
        return `клетка ${cellId} занята своим бойцом`;
      }
      if (owner != null) {
        return `на клетку ${cellId} можно только пройти насквозь: не хватает шага, чтобы с неё сойти`;
      }
      return `клетка ${cellId} вне радиуса перемещения`;
    }
    if (occupiedCellIds(partyState, fighterId).has(String(cellId))) {
      return `клетка ${cellId} занята`;
    }
    return `клетка ${cellId} вне радиуса перемещения`;
  }

  return null;
};
