import { SET_FIGHTER_CELL } from '#shared/actions/fighter.js';
import { HINTS } from '#shared/constants/hints.js';
import { findPlayer, playerHeroes, resolveOkBackControls } from '#shared/helpers/base.js';
import {
  allPlayersPlacementReady,
  clearHeroOnNumberedCell,
  confirmDoneAiPlacements,
  hasHeroOnNumberedCell,
  isLockedHero,
  numberedCellId,
  placePhaseHighlightedCellIds,
  placementAreaCells,
  placementConflictFighterId,
  placementRejection,
  playerFightersPlaced,
  returnConflictedFighters,
} from '#shared/helpers/placement.js';

/**
 * Нечего расставлять — подтверждаем сами. Так у героя без помощников (Никола Тесла: один герой,
 * он уже стоит на номерной клетке и двигать его нельзя) расстановка завершается без нажатия «ОК».
 */
const confirmIfNothingToPlace = (partyState, playerId) => {
  const player = findPlayer(partyState, playerId);
  if (!player?.fighters?.length || player.placementReady) return partyState;
  if (!playerFightersPlaced(player)) return partyState;

  const movable = player.fighters.some(fighter => !isLockedHero(fighter, partyState, playerId));
  if (movable) return partyState;

  player.placementReady = true;
  return partyState;
};

/** Боец, чью клетку занял другой игрок: его и вернём на полку перед подтверждением. */
const conflictFighterId = (partyState, playerId) =>
  placementConflictFighterId(partyState, playerId);

const conflictFighterName = (partyState, playerId) => {
  const fighterId = conflictFighterId(partyState, playerId);
  if (fighterId == null) return '';
  const player = findPlayer(partyState, playerId);
  const fighter = (player?.fighters ?? []).find(entry => String(entry.id) === fighterId);
  return fighter?.name || fighterId;
};

/**
 * Клетку одну на всех: стороны расставляются одновременно, и пока игрок думал, сосед мог занять ту же
 * клетку. «Кто первый поставил, того и тапки» — занятую клетку не отбираем, а проигравший возвращает
 * бойца на полку и ставит его заново (правило владельца). Возвращает id вернувшихся бойцов.
 */
const reclaimTakenCells = (partyState, playerId) => returnConflictedFighters(partyState, playerId);

/**
 * Кто уже подтвердил расстановку, а его клетку всё-таки заняли (соперник успел позже): подтверждение
 * снимаем, бойца возвращаем на полку — иначе партия не началась бы никогда: `gameStart.body` ждёт
 * готовности всех, а `allPlayersPlacementReady` видит двух бойцов на одной клетке.
 */
const reopenTakenPlacements = partyState => {
  const reopened = [];
  for (const player of partyState.players ?? []) {
    if (player.placementReady !== true) continue;
    if (!placementConflictFighterId(partyState, player.id)) continue;
    const returned = returnConflictedFighters(partyState, player.id);
    if (!returned.length) continue;
    player.placementReady = false;
    reopened.push(String(player.id));
  }
  return reopened;
};

export default {
  name: 'place',

  hints: {
    confirmFighters: {
      active: (partyState, playerId) => {
        const player = findPlayer(partyState, playerId);
        return Boolean(player && !player.placementReady && playerFightersPlaced(player));
      },
      text: HINTS.place.confirmFighters,
    },
    placeFighters: {
      active: (partyState, playerId) => {
        const player = findPlayer(partyState, playerId);
        return Boolean(player && !player.placementReady);
      },
      text: HINTS.place.placeFighters,
    },
    cellTaken: {
      active: (partyState, playerId) => {
        const player = findPlayer(partyState, playerId);
        return Boolean(player && !player.placementReady && conflictFighterId(partyState, playerId));
      },
      text: (partyState, playerId) =>
        HINTS.place.cellTaken({ name: conflictFighterName(partyState, playerId) }),
    },
    waitingForAllPlayers: {
      active: (partyState, playerId) => {
        const player = findPlayer(partyState, playerId);
        return Boolean(player?.placementReady && !allPlayersPlacementReady(partyState));
      },
      text: HINTS.place.waitingForAllPlayers,
    },
  },

  active: (partyState, playerId) => {
    const player = findPlayer(partyState, playerId);
    if (!player) return false;
    if (player.placementReady) {
      return !allPlayersPlacementReady(partyState);
    }
    const heroes = playerHeroes(player);
    if (heroes.length === 1) return true;
    return hasHeroOnNumberedCell(partyState, playerId) && player.numberedHeroCommitted;
  },

  enter: (partyState, playerId) => {
    const player = findPlayer(partyState, playerId);
    const heroes = playerHeroes(player);
    if (heroes.length !== 1 || hasHeroOnNumberedCell(partyState, playerId)) {
      return confirmIfNothingToPlace(partyState, playerId);
    }

    const cellId = numberedCellId(partyState, playerId);
    if (cellId == null) return partyState;

    const state = clearHeroOnNumberedCell(partyState, playerId);
    SET_FIGHTER_CELL(state, { fighterId: heroes[0].id, cellId, start: true });
    const updated = findPlayer(state, playerId);
    if (updated) updated.numberedHeroCommitted = true;
    return confirmIfNothingToPlace(state, playerId);
  },

  /**
   * Подтверждение компьютера — не по кнопке, а по факту: как только его расстановка закончена, слот
   * готов (см. `confirmDoneAiPlacements`). Тело фазы зовётся после каждого действия, поэтому плашка
   * «Расстановка» уходит с карточки компьютера тем же шагом, каким он поставил последнего бойца.
   */
  body: partyState => {
    reopenTakenPlacements(partyState);
    return confirmDoneAiPlacements(partyState);
  },

  ui(partyState, playerId, clientContext = {}, phase) {
    const player = findPlayer(partyState, playerId);
    if (player?.placementReady) {
      return {
        highlightedCellIds: [],
        placementCells: [],
        controls: {
          ok: { visible: false, enabled: false, label: null },
          back: { visible: false, enabled: false, label: null },
        },
      };
    }
    return {
      highlightedCellIds: placePhaseHighlightedCellIds(
        partyState,
        playerId,
        clientContext.selectedFighterId,
      ),
      placementCells: placementAreaCells(partyState, playerId),
      controls: resolveOkBackControls(phase, partyState, playerId),
    };
  },

  ok: {
    enabled: (partyState, playerId) => {
      const player = findPlayer(partyState, playerId);
      if (!player || player.placementReady) return false;
      // «ОК» ждёт, пока расстановка действительна: занятую чужим бойцом клетку игрок переставит сам
      if (conflictFighterId(partyState, playerId)) return false;
      return playerFightersPlaced(player);
    },
    onPress: (partyState, action) => {
      const player = findPlayer(partyState, action.playerId);
      if (!player) {
        throw new Error('UI_OK: игрок не найден');
      }
      // бойцы с занятых клеток уходят на полку: их видно в `placementCells` как свободные клетки
      reclaimTakenCells(partyState, action.playerId);
      if (!playerFightersPlaced(player)) return partyState;

      player.placementReady = true;
      return partyState;
    },
  },

  back: {
    visible: () => false,
    enabled: () => false,
  },

  moves: {
    PICK: (partyState, action) => {
      if (action.kind !== 'cell') {
        throw new Error(`PICK: в расстановке доступен клик по клетке (пришло "${action.kind}")`);
      }

      const reason = placementRejection(partyState, action.playerId, action.fighterId, action.id);
      if (reason) throw new Error(`PICK: ${reason}`);

      return SET_FIGHTER_CELL(partyState, {
        fighterId: action.fighterId,
        cellId: action.id,
        start: true,
      });
    },
  },
};

/*
 Расстановка всех бойцов в области героя. Фаза активна, пока игрок не подтвердил расстановку кнопкой «ОК», и не все игроки не завершили расстановку.

 1. Если у игрока один герой — при входе он автоматически ставится на номерную клетку (SET_FIGHTER_CELL).
 2. Если героев несколько — сюда попадаем только после закреплённого выбора в pickNumHero. И выбранный герой уже стоит на номерной клетке.
 3. Сверху подсказка: «Разместите на поле всех своих бойцов. Их можно ставить на клетках в одной области с героем.» Текст висит, пока игрок не нажмёт «ОК».
 4. Пока «ОК» не нажата, можно переставлять бойцов по допустимым клеткам: клик по клетке (PICK kind cell) с выбранным бойцом. Допустимые клетки — клетки, у которых есть общая стихия с номерной клеткой героя (двух- и трёхцветные клетки считаются сразу во всех своих областях). Допустимые свободные клетки подсвечиваются до нажатия «ОК». Главный герой на номерной клетке зафиксирован — его двигать нельзя.
 5. «ОК» активна, когда все бойцы стоят на клетках; после нажатия расстановка этого игрока считается завершённой.
 6. «Назад» в этой фазе невидима.
 7. После нажатия «ОК» мы ждем расстановки всех игроков, если они еще не завершены, и выводим подсказку "Ожидание расстановки всех игроков". Переход в следующую фазу происходит только после того, как все игроки завершили расстановку.
 8. Позицию пишет общий кирпич SET_FIGHTER_CELL (start: true), а условия (свой боец, область
    расстановки, зафиксированный герой, занятая клетка) — placementRejection в helpers/placement.js.
 9. Подсказка различает «ещё расставляю» и «всё стоит, подтвердите»: пока бойцы стоят не все —
    placeFighters, когда все встали, а «ОК» ещё не нажата, — confirmFighters.
 10. Слот компьютера подтверждается сам, как только расставил всех бойцов (body →
    confirmDoneAiPlacements): его плашка «Расстановка» уходит сразу, не дожидаясь человека, и цикл
    компьютера останавливается сам — решений ему движок больше не предлагает.
 */
