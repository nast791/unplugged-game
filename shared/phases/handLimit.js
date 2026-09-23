import { SET_CARDS } from '#shared/actions-new/cards.js';
import { rules } from '#shared/constants/rules.js';
import {
  handCardIds,
  hasActions,
  hasMoment,
  isActivePlayer,
  isHandOverLimit,
  mustDiscardCount,
} from '#shared/helpers/turn.js';

export default {
  name: 'handLimit',

  hints: {
    discardCards: {
      active: () => true,
      text: (partyState, playerId) =>
        `Рука больше ${rules.maxHandSize} карт: сбросьте ещё ${mustDiscardCount(partyState, playerId)}`,
    },
  },

  active: (partyState, playerId) =>
    isActivePlayer(partyState, playerId) &&
    !hasActions(partyState) &&
    !hasMoment(partyState) &&
    isHandOverLimit(partyState, playerId),

  ui(partyState, playerId) {
    return {
      deck: { clickable: false },
      highlightedCellIds: [],
      highlightedFighterIds: [],
      playableCardIds: handCardIds(partyState, playerId),
      disabledCardIds: [],
      controls: {
        ok: { visible: false, enabled: false, label: null },
        back: { visible: false, enabled: false, label: null },
      },
    };
  },

  moves: {
    PICK: (partyState, action) => {
      if (action.kind !== 'card') {
        throw new Error(
          `PICK: при сбросе руки доступен клик по карте (пришло "${action.kind}")`,
        );
      }
      return SET_CARDS(partyState, {
        playerId: action.playerId,
        op: 'discard',
        cardIds: [action.id],
      });
    },
  },
};

/*
 Фаза handLimit: сброс руки в конце хода.

 1. Активна, когда ход мой, действий не осталось, ни один момент (перемещение, бой, выбор цели) не в работе
    и карт в руке больше rules.maxHandSize. Стоит первой в hook.phases и перебивает choose.
 2. Подсказка сверху показывает, сколько карт осталось сбросить.
 3. Клик по любой карте руки — сброс (SET_CARDS discard). Кнопки нет: сброс обязателен, пока рука сверх лимита.
 4. Как только рука влезает в лимит, фаза становится неактивной, turn.body отдаёт ход дальше, и хук
    переходит в turnEnd.
 */
