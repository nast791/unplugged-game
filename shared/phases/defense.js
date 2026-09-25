import { SET_COMBAT } from '#shared/actions-new/combat.js';
import { advanceCombat } from '#shared/cards/run.js';
import { resolveOkBackControls } from '#shared/helpers/base.js';
import { cardKey, hasFighterForCard, isDefenseCard } from '#shared/helpers/cards.js';
import {
  combatChoiceOf,
  endGameIfFinished,
  handCardIds,
  handCards,
  isMomentMine,
} from '#shared/helpers/turn.js';

/** Карты руки, которыми можно защититься: тип подходит и привязанный боец ещё на поле. */
const defenseCardIds = (partyState, playerId) =>
  handCards(partyState, playerId)
    .filter(isDefenseCard)
    .filter(card => hasFighterForCard(partyState, playerId, card))
    .map(cardKey);

const isDefender = (partyState, playerId) =>
  partyState.combat?.stage === 'defense' &&
  String(partyState.combat?.defenderPlayerId) === String(playerId);

/** Пауза выбора карт, если она принадлежит игроку: перемещение ведёт фаза movement. */
const choiceOf = (partyState, playerId) => {
  const choice = combatChoiceOf(partyState, playerId);
  return choice && choice.effect !== 'movement' ? choice : null;
};

/** Ответ защитника: карта или пас. Дальше бой доигрывает advanceCombat. */
const answerDefense = (partyState, action) => {
  let state = SET_COMBAT(partyState, {
    op: 'defense',
    playerId: action.playerId,
    cardId: action.cardId ?? null,
  });
  state = advanceCombat(state);

  return endGameIfFinished(state);
};

/**
 * Можно ли закрыть паузу общей кнопкой: если игрок уже что-то выбрал — да, эффект сработал;
 * если ничего не выбрал — только у необязательного эффекта (это и есть отказ от него).
 */
const canFinishChoice = choice =>
  (Number(choice?.used) || 0) > 0 || choice?.optional === true;

/** Ответ в паузе эффекта: выбранная карта уходит в сброс, бой доигрывается. */
const answerChoice = (partyState, action, op) => {
  let state = SET_COMBAT(partyState, {
    op,
    playerId: action.playerId,
    cardId: action.cardId ?? action.id ?? null,
  });
  state = advanceCombat(state);

  return endGameIfFinished(state);
};

export default {
  name: 'defense',

  hints: {
    combatChoice: {
      active: (partyState, playerId) => Boolean(choiceOf(partyState, playerId)),
      text: (partyState, playerId) => {
        const choice = choiceOf(partyState, playerId);
        return choice?.effect === 'movement'
          ? 'Передвиньте бойцов по подсвеченным клеткам'
          : 'Выберите карту для эффекта или нажмите кнопку, ничего не выбирая';
      },
    },
    noDefenseCards: {
      active: (partyState, playerId) =>
        partyState.combat?.stage === 'defense' &&
        defenseCardIds(partyState, playerId).length === 0,
      text: () => 'Карт защиты нет: закончите действие — защита 0 и весь урон по бойцу',
    },
    defend: {
      active: (partyState, playerId) => Boolean(isDefender(partyState, playerId)),
      text: () =>
        'Защититесь картой defense|hybrid или закончите действие без карты',
    },
  },

  active: (partyState, playerId) =>
    isMomentMine(partyState, playerId, 'combat') &&
    (isDefender(partyState, playerId) ||
      Boolean(choiceOf(partyState, playerId))),

  ui(partyState, playerId, _clientContext, phase) {
    const combat = partyState.combat;
    const choice = choiceOf(partyState, playerId);

    const playable = choice
      ? choice.candidates.map(entry => String(entry.cardId))
      : defenseCardIds(partyState, playerId);

    return {
      deck: { clickable: false },
      highlightedCellIds: [],
      highlightedFighterIds:
        combat?.attackerFighterId == null
          ? []
          : [String(combat.attackerFighterId)],
      framedFighterIds:
        combat?.targetFighterId == null ? [] : [String(combat.targetFighterId)],
      playableCardIds: playable,
      disabledCardIds: handCardIds(partyState, playerId).filter(
        cardId => !playable.includes(cardId),
      ),
      controls: choice
        ? {
            // одна общая кнопка: ничего не выбрано — отказ, выбрано — эффект заканчивается
            ok: {
              visible: true,
              enabled: canFinishChoice(choice),
              label: choice.used > 0 ? 'Закончить эффект' : 'Пропустить эффект',
            },
            back: { visible: false, enabled: false, label: null },
          }
        : resolveOkBackControls(phase, partyState, playerId),
    };
  },

  ok: {
    label: 'Закончить действие',
    enabled: (partyState, playerId) => {
      const choice = choiceOf(partyState, playerId);
      if (choice) return canFinishChoice(choice);
      return isDefender(partyState, playerId);
    },
    onPress: (partyState, action) =>
      choiceOf(partyState, action.playerId)
        ? answerChoice(partyState, action, 'skip')
        : answerDefense(partyState, { playerId: action.playerId, cardId: null }),
  },

  back: {
    visible: () => false,
    enabled: () => false,
  },

  moves: {
    PICK: (partyState, action) => {
      if (choiceOf(partyState, action.playerId)) {
        if (action.kind !== 'card') {
          throw new Error(
            `PICK: в паузе эффекта выбирают карту руки (пришло "${action.kind}")`,
          );
        }
        return answerChoice(partyState, action, 'pick');
      }

      if (action.kind !== 'card') {
        throw new Error(
          `PICK: в защите доступен клик по карте защиты (пришло "${action.kind}")`,
        );
      }
      return answerDefense(partyState, {
        playerId: action.playerId,
        cardId: action.id,
      });
    },
  },
};

/*
 Фаза defense: ответ защитника на объявленную атаку и окна эффектов боя.

 1. Активна, пока бой на stage = 'defense' и игрок — защитник, а также когда этому игроку открыто окно
    эффекта боя (тогда он выбирает карту из руки или отказывается от эффекта).
 2. Подсказка сверху: если карт защиты в руке нет — «Карт защиты нет: закончите действие —
    защита 0 и весь урон по бойцу», иначе «Защититесь картой defense|hybrid или закончите действие».
 3. клик по карте defense|hybrid (playableCardIds) — карта уходит в слот защиты, дальше бой доигрывает
    advanceCombat (shared/cards/run.js): окно «немедленно» → окно «во время боя» → числа
    max(0, attackValue − defenseValue) → урон по цели → окно «после боя» → закрытие боя. В каждом окне
    первым играет защитник.
 4. Кнопка «Закончить действие» — пас: защита 0, весь урон по бойцу. Своих действий защитник не тратит.
    В самом бою кнопка неактивна: она про ход, а не про эффекты.
 5. выбор эффекта боя: если правило карты ждёт решения (например, «сбросьте карту и прибавьте её бонус»),
    бой встаёт на паузу, его очередь эффектов лежит в combat.effects (статусы для логгера и анимации:
    applied | skipped | waiting | declined). Игрок кликает карту руки (SET_COMBAT boost) или отказывается
    (SET_COMBAT skip), после чего бой продолжается с того же места.
 6. Если после урона и эффектов живой сторон осталось не больше одной — партия завершается (hook = gameEnd,
    winner). Проверка победы откладывается, пока бой не закрыт: действие доигрывается до конца, эффекты обеих
    карт срабатывают, и только потом объявляется итог (если погибли все герои — побеждает активный игрок).
 7. Эффекты карт разыгрываются правилами самой карты (card.rules): общий исполнитель — shared/rules/run.js,
    очередь и порядок окон боя — shared/cards/run.js.
 */
