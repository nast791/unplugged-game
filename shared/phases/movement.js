import { SET_COMBAT } from '#shared/actions-new/combat.js';
import { SET_MOVEMENT } from '#shared/actions-new/movement.js';
import { advanceCombat } from '#shared/cards/run.js';
import { resolveOkBackControls } from '#shared/helpers/base.js';
import {
  bonusCardIds,
  endGameIfFinished,
  handCardIds,
  isMomentMine,
  movableFighterIds,
  movementDestinations,
  movementRejection,
} from '#shared/helpers/turn.js';

const cellIdOf = action => action.cellId ?? action.id;

/** Перемещение открыто эффектом карты: бой ждёт, пока игрок подвигал бойцов. */
const effectMovement = partyState =>
  partyState.combat?.choice?.effect === 'movement' ? partyState.combat.choice : null;

/** Закрыть перемещение от эффекта: шаг очереди получает итог, бой доигрывается дальше. */
const finishEffectMovement = (partyState, action) => {
  let state = SET_MOVEMENT(partyState, {
    op: 'close',
    playerId: action.playerId,
  });
  if (!effectMovement(state)) return endGameIfFinished(state);

  state = SET_COMBAT(state, { op: 'skip', playerId: action.playerId });
  state = advanceCombat(state);

  return endGameIfFinished(state);
};

export default {
  name: 'movement',

  hints: {
    moveFighters: {
      active: () => true,
      text: partyState =>
        partyState.movement?.source == null
          ? 'Двигайте своих бойцов по подсвеченным клеткам или закончите действие'
          : 'Передвиньте бойцов по подсвеченным клеткам или закончите эффект',
    },
  },

  active: (partyState, playerId) =>
    isMomentMine(partyState, playerId, 'movement'),

  ui(partyState, playerId, clientContext = {}, phase) {
    const selectedFighterId = clientContext.selectedFighterId ?? null;
    const fromEffect = partyState.movement?.source != null;
    // усиление картой — только у обычного перемещения, эффект карты усиливать нечем
    const playable =
      !fromEffect && !partyState.movement?.bonusUsed
        ? bonusCardIds(partyState, playerId)
        : [];

    return {
      deck: { clickable: false },
      highlightedCellIds:
        selectedFighterId == null
          ? []
          : movementDestinations(partyState, playerId, selectedFighterId),
      // кого вообще можно двигать в этом перемещении: у эффекта это список из правила
      highlightedFighterIds: movableFighterIds(partyState, playerId),
      playableCardIds: playable,
      disabledCardIds: handCardIds(partyState, playerId).filter(
        cardId => !playable.includes(cardId),
      ),
      controls: fromEffect
        ? {
            // та же общая кнопка, что и в остальных фазах: без ходов — отказ от эффекта
            ok: {
              visible: true,
              enabled:
                partyState.movement?.optional === true ||
                (partyState.movement?.moves?.length ?? 0) > 0,
              label: 'Закончить эффект',
            },
            back: { visible: false, enabled: false, label: null },
          }
        : resolveOkBackControls(phase, partyState, playerId),
    };
  },

  ok: {
    label: 'Закончить действие',
    enabled: (partyState, playerId) => {
      if (!isMomentMine(partyState, playerId, 'movement')) return false;
      if (partyState.movement?.source == null) return true;
      return (
        partyState.movement?.optional === true ||
        (partyState.movement?.moves?.length ?? 0) > 0
      );
    },
    onPress: (partyState, action) =>
      effectMovement(partyState)
        ? finishEffectMovement(partyState, action)
        : SET_MOVEMENT(partyState, { op: 'close', playerId: action.playerId }),
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
 Фаза movement: объявленное перемещение и перемещение от эффекта карты.

 1. Активна, пока черновик перемещения открыт и принадлежит игроку.
 2. Обычное перемещение (клик по колоде): радиус = fighter.move + движение от карты усиления,
    отсчёт от origins бойца (запоминается при первом шаге), занятые клетки недоступны, сквозь своих
    проходить можно при rules.canPassThroughTeammates.
 3. Перемещение от эффекта карты: правило задаёт бюджет (budget), список бойцов (fighters) и
    необязательность (optional). Того же бойца можно вести по клеткам, но не дальше бюджета от его
    исходной клетки; враги блокируют путь (это перемещение, а не перенос). Подсвечены только бойцы
    из списка, кнопка называется «Закончить эффект», усиления картой нет.
 4. Клик по подсвеченной клетке — шаг (SET_MOVEMENT step → SET_FIGHTER_CELL). Клик по недоступной клетке
    отклоняется с причиной.
 5. Одно усиление за обычное действие: клик по карте с bonus (playableCardIds) уводит её в сброс и
    добавляет bonus всему действию — дальше карты недоступны (bonusUsed).
 6. «Закончить действие» закрывает обычное перемещение; «Закончить эффект» закрывает перемещение от
    эффекта: шаг очереди боя получает итог (applied, если хоть кого-то подвинули, иначе declined),
    бой доигрывается дальше (advanceCombat), затем проверяется победа.
 7. Пока перемещение открыто, другие игроки находятся в фазе waiting и видят только позиции бойцов
    на момент начала перемещения (маскирование в проекции).
 */
