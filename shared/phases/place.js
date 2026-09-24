import { SET_FIGHTER_CELL } from '#shared/actions-new/fighter.js';
import { findPlayer, playerHeroes, resolveOkBackControls } from '#shared/helpers/base.js';
import {
  allPlayersPlacementReady,
  clearHeroOnNumberedCell,
  hasHeroOnNumberedCell,
  numberedCellId,
  placePhaseHighlightedCellIds,
  placementRejection,
  playerFightersPlaced,
} from '#shared/helpers/placement.js';

export default {
  name: 'place',

  hints: {
    placeFighters: {
      active: (partyState, playerId) => {
        const player = findPlayer(partyState, playerId);
        return Boolean(player && !player.placementReady);
      },
      text: () =>
        'Разместите на поле всех своих бойцов. Их можно размещать в одной зоне с вашим героем',
    },
    waitingForAllPlayers: {
      active: (partyState, playerId) => {
        const player = findPlayer(partyState, playerId);
        return Boolean(
          player?.placementReady && !allPlayersPlacementReady(partyState),
        );
      },
      text: () => 'Ожидание расстановки бойцов всех игроков',
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
    return (
      hasHeroOnNumberedCell(partyState, playerId) && player.numberedHeroCommitted
    );
  },

  enter: (partyState, playerId) => {
    const player = findPlayer(partyState, playerId);
    const heroes = playerHeroes(player);
    if (heroes.length !== 1 || hasHeroOnNumberedCell(partyState, playerId)) {
      return partyState;
    }

    const cellId = numberedCellId(partyState, playerId);
    if (cellId == null) return partyState;

    const state = clearHeroOnNumberedCell(partyState, playerId);
    SET_FIGHTER_CELL(state, { fighterId: heroes[0].id, cellId, start: true });
    const updated = findPlayer(state, playerId);
    if (updated) updated.numberedHeroCommitted = true;
    return state;
  },

  ui(partyState, playerId, clientContext = {}, phase) {
    const player = findPlayer(partyState, playerId);
    if (player?.placementReady) {
      return {
        highlightedCellIds: [],
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
      controls: resolveOkBackControls(phase, partyState, playerId),
    };
  },

  ok: {
    enabled: (partyState, playerId) => {
      const player = findPlayer(partyState, playerId);
      if (!player || player.placementReady) return false;
      return playerFightersPlaced(player);
    },
    onPress: (partyState, action) => {
      const player = findPlayer(partyState, action.playerId);
      if (!player) {
        throw new Error('UI_OK: игрок не найден');
      }
      if (!playerFightersPlaced(player)) {
        throw new Error('UI_OK: расставьте всех бойцов');
      }
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
        throw new Error(
          `PICK: в расстановке доступен клик по клетке (пришло "${action.kind}")`,
        );
      }

      const reason = placementRejection(
        partyState,
        action.playerId,
        action.fighterId,
        action.id,
      );
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
 Расстановка всех бойцов в стартовой зоне игрока. Фаза активна, пока игрок не подтвердил расстановку кнопкой «ОК», и не все игроки не завершили расстановку.

 1. Если у игрока один герой — при входе он автоматически ставится на номерную клетку (SET_FIGHTER_CELL).
 2. Если героев несколько — сюда попадаем только после закреплённого выбора в pickNumHero. И выбранный герой уже стоит на номерной клетке.
 3. Сверху подсказка: «Разместите на поле всех своих бойцов. Их можно размещать в одной зоне с вашим героем.» Текст висит, пока игрок не нажмёт «ОК».
 4. Пока «ОК» не нажата, можно переставлять бойцов по допустимым клеткам: клик по клетке (PICK kind cell) с выбранным бойцом. Допустимые клетки - клетки, содержащие такой же цвет, что и клетка, на которой стоит ваш главный герой. Допустимые свободные клетки подсвечиваются до нажатия «ОК». Главный герой на номерной клетке зафиксирован — его двигать нельзя.
 5. «ОК» активна, когда все бойцы стоят на клетках; после нажатия расстановка этого игрока считается завершённой.
 6. «Назад» в этой фазе невидима.
 7. После нажатия «ОК» мы ждем расстановки всех игроков, если они еще не завершены, и выводим подсказку "Ожидание расстановки всех игроков". Переход в следующую фазу происходит только после того, как все игроки завершили расстановку.
 8. Позицию пишет общий кирпич SET_FIGHTER_CELL (start: true), а условия (свой боец, область
    расстановки, зафиксированный герой, занятая клетка) — placementRejection в helpers/placement.js.
 */
