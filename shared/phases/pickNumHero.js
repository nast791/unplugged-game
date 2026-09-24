import { SET_FIGHTER_CELL } from '#shared/actions-new/fighter.js';
import { findPlayer, playerHeroes, resolveOkBackControls } from '#shared/helpers/base.js';
import {
  clearHeroOnNumberedCell,
  hasPickPreview,
  numberPickRejection,
  numberedCellId,
} from '#shared/helpers/placement.js';

export default {
  name: 'pickNumHero',

  hints: {
    chooseHero: {
      active: (partyState, playerId) => !hasPickPreview(partyState, playerId),
      text: () =>
        'Выберите одного из героев, который будет размещен на номерной клетке поля',
    },
    confirmHero: {
      active: (partyState, playerId) => hasPickPreview(partyState, playerId),
      text: () => 'Подтвердите выбор героя или нажмите «Назад»',
    },
  },

  active: (partyState, playerId) => {
    const player = findPlayer(partyState, playerId);
    return (
      playerHeroes(player).length > 1 && !player?.numberedHeroCommitted
    );
  },

  enter: (partyState, playerId) => {
    const player = findPlayer(partyState, playerId);
    if (player) player.numberedHeroCommitted = false;
    return partyState;
  },

  exit: (partyState, playerId) => {
    const player = findPlayer(partyState, playerId);
    if (!player || player.numberedHeroCommitted) return partyState;
    if (playerHeroes(player).length > 1) {
      throw new Error(
        'pickNumHero: нельзя выйти из фазы без подтверждения выбора героя на номерной клетке',
      );
    }
    return partyState;
  },

  ui(partyState, playerId, _clientContext, phase) {
    const cellId = numberedCellId(partyState, playerId);
    const highlighted =
      cellId == null ? [] : [String(cellId)];
    return {
      modals: { pickNumHero: !hasPickPreview(partyState, playerId) },
      highlightedCellIds: highlighted,
      controls: resolveOkBackControls(phase, partyState, playerId),
    };
  },

  ok: {
    enabled: (partyState, playerId) => hasPickPreview(partyState, playerId),
    onPress: (partyState, action) => {
      if (!hasPickPreview(partyState, action.playerId)) {
        throw new Error('UI_OK: сначала выберите героя для номерной клетки');
      }
      const player = findPlayer(partyState, action.playerId);
      if (player) player.numberedHeroCommitted = true;
      return partyState;
    },
  },

  back: {
    visible: (partyState, playerId) => hasPickPreview(partyState, playerId),
    enabled: (partyState, playerId) => hasPickPreview(partyState, playerId),
    onPress: (partyState, action) => {
      const player = findPlayer(partyState, action.playerId);
      if (player) player._activePhase = null;
      return clearHeroOnNumberedCell(partyState, action.playerId);
    },
  },

  moves: {
    PICK: (partyState, action) => {
      if (action.kind !== 'fighter') {
        throw new Error(
          `PICK: в выборе героя доступен клик по своему герою (пришло "${action.kind}")`,
        );
      }

      const reason = numberPickRejection(
        partyState,
        action.playerId,
        action.id,
      );
      if (reason) throw new Error(`PICK: ${reason}`);

      const state = clearHeroOnNumberedCell(partyState, action.playerId);
      return SET_FIGHTER_CELL(state, {
        fighterId: action.id,
        cellId: numberedCellId(state, action.playerId),
        start: true,
      });
    },
  },
};

/*
 Выбор героя для номерной клетки. Только если у игрока несколько героев;
 при одном герое эта фаза пропускается — сразу расстановка (place).

 1. Фаза активна, пока игрок не подтвердил выбор героя для расстановки на номерной клетке.
 2. Пока герой не выбран: сверху подсказка «Выберите одного из героев…», открыта модалка с портретами, игрок отмечает одного героя.
 3. После выбора герой появляется на номерной клетке как предпросмотр (ещё не закреплён окончательно). Номер клетки определяется по порядковому номеру игрока. Модалка закрывается, подсказка меняется на «Подтвердите выбор или нажмите «Назад»».
 4. В режиме предпросмотра активны кнопки «ОК» и «Назад».
 5. «Назад» удаляет героя с номерной клетки — снова пункты 2-4.
 6. «ОК» подтверждает выбор героя для расстановки на номерной клетке — игрок переходит к следующей фазе.
 7. Выйти из фазы без подтверждения выбора героя для расстановки на номерной клетке - нельзя.
 8. Позицию пишет общий кирпич SET_FIGHTER_CELL (start: true), а условия (свой герой, есть номерная
    клетка, расстановка не подтверждена) — numberPickRejection в helpers/placement.js.
 */
