import { findPlayer } from '#shared/helpers/base.js';

const playerName = (partyState, playerId) =>
  findPlayer(partyState, playerId)?.name ?? String(playerId ?? '—');

export default {
  name: 'waiting',

  hints: {
    waitingMovement: {
      active: partyState => Boolean(partyState.movement),
      text: partyState =>
        `Ждём перемещения бойцов: ${playerName(partyState, partyState.movement?.playerId)}`,
    },
    waitingTurn: {
      active: () => true,
      text: partyState =>
        `Ход игрока ${playerName(partyState, partyState.turn?.playerId)}`,
    },
  },

  active: (partyState, playerId) =>
    String(partyState.turn?.playerId ?? '') !== String(playerId),

  ui() {
    return {
      deck: { clickable: false },
      highlightedCellIds: [],
      highlightedFighterIds: [],
      playableCardIds: [],
      disabledCardIds: [],
      controls: {
        ok: { visible: false, enabled: false, label: null },
        back: { visible: false, enabled: false, label: null },
      },
    };
  },
};

/*
 Фаза waiting: игрок не действует, а ждёт чужой ход.

 1. Активна для всех, кто не активный игрок. Phases в hook.phases идут по приоритету, поэтому
    у того, кто обязан отвечать (защита, выбор цели), активна своя фаза, а не эта.
 2. Подсказка сверху: при открытом перемещении — «Ждём перемещения бойцов: <имя>», иначе «Ход игрока <имя>».
 3. Ходов (moves) у фазы нет, поэтому core отклонит любое действие ожидающего игрока.
 */
