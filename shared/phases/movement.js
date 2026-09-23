import { SET_MOVEMENT } from '#shared/actions-new/movement.js';
import { resolveOkBackControls } from '#shared/helpers/base.js';
import {
  bonusCardIds,
  handCardIds,
  isMomentMine,
  movementDestinations,
  movementRejection,
} from '#shared/helpers/turn.js';

const cellIdOf = action => action.cellId ?? action.id;

export default {
  name: 'movement',

  hints: {
    moveFighters: {
      active: () => true,
      text: () =>
        'Двигайте своих бойцов по подсвеченным клеткам или закончите действие',
    },
  },

  active: (partyState, playerId) =>
    isMomentMine(partyState, playerId, 'movement'),

  ui(partyState, playerId, clientContext = {}, phase) {
    const selectedFighterId = clientContext.selectedFighterId ?? null;
    const playable = partyState.movement?.bonusUsed
      ? []
      : bonusCardIds(partyState, playerId);

    return {
      deck: { clickable: false },
      highlightedCellIds:
        selectedFighterId == null
          ? []
          : movementDestinations(partyState, playerId, selectedFighterId),
      highlightedFighterIds: [],
      playableCardIds: playable,
      disabledCardIds: handCardIds(partyState, playerId).filter(
        cardId => !playable.includes(cardId),
      ),
      controls: resolveOkBackControls(phase, partyState, playerId),
    };
  },

  ok: {
    label: 'Закончить действие',
    enabled: (partyState, playerId) =>
      isMomentMine(partyState, playerId, 'movement'),
    onPress: (partyState, action) =>
      SET_MOVEMENT(partyState, { op: 'close', playerId: action.playerId }),
  },

  back: {
    visible: () => false,
    enabled: () => false,
  },

  moves: {
    PICK: (partyState, action) => {
      const playerId = action.playerId;

      if (action.kind === 'cell') {
        const cellId = cellIdOf(action);
        const reason = movementRejection(
          partyState,
          playerId,
          action.fighterId,
          cellId,
        );
        if (reason) throw new Error(`PICK: ${reason}`);

        return SET_MOVEMENT(partyState, {
          op: 'step',
          playerId,
          fighterId: action.fighterId,
          cellId,
        });
      }

      if (action.kind === 'card') {
        return SET_MOVEMENT(partyState, {
          op: 'bonus',
          playerId,
          cardId: action.id,
        });
      }

      throw new Error(
        `PICK: в перемещении доступны клетка и карта усиления (пришло "${action.kind}")`,
      );
    },
  },
};

/*
 Фаза movement: объявленное перемещение.

 1. Активна, пока черновик перемещения открыт и принадлежит игроку.
 2. Клик по своему бойцу подсвечивает его клетки: радиус fighter.move + movement.bonus, считается
    от origins бойца (запоминается при первом шаге), занятые клетки недоступны, сквозь своих проходить
    можно при rules.canPassThroughTeammates. Подсветку и выбранного бойца отдаём в ui для владельца.
 3. Клик по подсвеченной клетке — шаг (SET_MOVEMENT step → SET_FIGHTER_CELL). Клик по недоступной клетке
    отклоняется с причиной.
 4. Одно усиление за действие: клик по карте с bonus (playableCardIds) уводит её в сброс и добавляет
    bonus всему действию — дальше карты недоступны (bonusUsed).
 5. Кнопка «Закончить действие» (UI_OK) закрывает перемещение; после этого действие окончено, и ход
    продолжается в фазе choose.
 6. Пока перемещение открыто, другие игроки находятся в фазе waiting и видят только позиции бойцов
    на момент начала перемещения (маскирование в проекции).
 */
