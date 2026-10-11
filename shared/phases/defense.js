import { SET_COMBAT } from '#shared/actions/combat.js';
import { SET_TARGETING } from '#shared/actions/targeting.js';
import {
  advanceCombat,
  declineWaitingStep,
  runCombatPicked,
  waitingCombatCard,
} from '#shared/cards/run.js';
import { HINTS } from '#shared/constants/hints.js';
import { resolveOkBackControls } from '#shared/helpers/base.js';
import { cardChoices } from '#shared/helpers/cards.js';
import { defenseCardIds } from '#shared/helpers/combat.js';
import {
  combatChoiceOf,
  endGameIfFinished,
  handCardIds,
  isMomentMine,
  isTargetingMine,
} from '#shared/helpers/turn.js';

const isDefender = (partyState, playerId) =>
  partyState.combat?.stage === 'defense' &&
  String(partyState.combat?.defenderPlayerId) === String(playerId);

/** Пауза выбора карт, если она принадлежит игроку: перемещение ведёт фаза movement. */
const choiceOf = (partyState, playerId) => {
  const choice = combatChoiceOf(partyState, playerId);
  return choice && choice.effect !== 'movement' ? choice : null;
};

/** Окно выбора, открытое картой боя и принадлежащее этому игроку: вариант, боец или клетка. */
const cardWindowOf = (partyState, playerId) =>
  isTargetingMine(partyState, playerId) ? partyState.targeting : null;

/** Окно выбора варианта эффекта (например, «активировать катушки» или «деактивировать»). */
const optionWindowOf = (partyState, playerId) => {
  const window = cardWindowOf(partyState, playerId);
  return window?.kind === 'options' ? window : null;
};

/** Окно бойцов и клеток, открытое картой боя: вариант ведёт своя ветка, здесь — только эти два вида. */
const targetWindowOf = (partyState, playerId) => {
  const window = cardWindowOf(partyState, playerId);
  return window && window.kind !== 'options' ? window : null;
};

/** Подсветка окна: бойцы окна `fighters` (у окна клеток подсвечиваются клетки). */
const windowFighterIds = (partyState, playerId) => {
  const window = cardWindowOf(partyState, playerId);
  if (!window || window.kind === 'cells') return [];
  return (window.candidates ?? []).map(entry => String(entry.fighterId ?? entry.id));
};

/** Подсветка окна клеток, открытого картой боя. */
const windowCellIds = (partyState, playerId) => {
  const window = cardWindowOf(partyState, playerId);
  if (!window || window.kind !== 'cells') return [];
  return (window.candidates ?? []).map(entry => String(entry.cellId ?? entry.id));
};

/**
 * Клик по варианту свойства только **отмечает** его: окно показывает выбор, а не спрашивает.
 * Применяет отметку общая кнопка (`ok.onPress` → `confirmOption`) — так у игрока есть один и тот же
 * путь для всех окон свойства («отметил — подтвердил»), а отметку видит и клиент (`targeting.picked`),
 * и бот (`ui.controls.ok` включается отметкой).
 */
const pickOption = (partyState, playerId, optionId) =>
  SET_TARGETING(partyState, { op: 'pick', playerId, optionId });

/**
 * Подтверждение отмеченного варианта: правила карты в моменте `picked` делают остальное,
 * дальше окно закрывает движок и бой доигрывается. Порядок обязателен: окно нужно закрыть **после**
 * отметки — `runCombatPicked` ищет ждущий шаг по `source` открытого окна.
 */
const confirmOption = (partyState, playerId) => {
  let state = runCombatPicked(partyState);
  state = SET_TARGETING(state, { op: 'close', playerId });
  state = advanceCombat(state);

  return endGameIfFinished(state);
};

/**
 * Цель отмечена в окне, которое открыла карта боя (`fighters` или `cells`): клик по бойцу или клетке.
 * Так работают «Плата пеплом» (какого духа сжечь) и первое действие «Счёта ударов» (кого добить
 * в области Ифрита): правила карты в моменте `picked` доигрывают эффект, окно закрывается,
 * бой продолжается.
 */
const answerTargeting = (partyState, playerId, action) => {
  const window = cardWindowOf(partyState, playerId);
  const wantCell = window?.kind === 'cells';
  const expected = wantCell ? 'cell' : 'fighter';
  if (action.kind !== expected) {
    throw new Error(`PICK: в окне выбора карты ждут "${expected}" (пришло "${action.kind}")`);
  }

  const pick = wantCell ? { cellId: action.id } : { fighterId: action.id };
  let state = SET_TARGETING(partyState, { op: 'pick', playerId, ...pick });
  state = runCombatPicked(state);
  state = SET_TARGETING(state, { op: 'close', playerId });
  state = advanceCombat(state);

  return endGameIfFinished(state);
};

/** Отказ от необязательного свойства: окно закрывается, шаг помечается «отказ». */
const declineOption = (partyState, playerId) => {
  let state = SET_TARGETING(partyState, { op: 'close', playerId });
  state = advanceCombat(declineWaitingStep(state));

  return endGameIfFinished(state);
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
const canFinishChoice = choice => (Number(choice?.used) || 0) > 0 || choice?.optional === true;

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

/**
 * Кнопка завершения окна или паузы свойства: одна общая «Закончить эффект» — вопросов «выбрать или нет»
 * в интерфейсе нет. Кнопка видна, когда шаг есть чем закончить (от свойства можно отказаться,
 * `required: false`, или выбор уже сделан); у обязательного окна её нет, пока цель не отмечена.
 */
const effectControls = canFinish => ({
  ok: {
    visible: canFinish,
    enabled: canFinish,
    label: canFinish ? 'Закончить эффект' : null,
  },
  back: { visible: false, enabled: false, label: null },
});

export default {
  name: 'defense',

  hints: {
    effectOption: {
      active: (partyState, playerId) => Boolean(optionWindowOf(partyState, playerId)),
      text: (partyState, playerId) =>
        HINTS.defense.effectOption({
          required: optionWindowOf(partyState, playerId)?.required === true,
        }),
    },
    effectTarget: {
      active: (partyState, playerId) =>
        Boolean(cardWindowOf(partyState, playerId)) && !optionWindowOf(partyState, playerId),
      text: (partyState, playerId) =>
        HINTS.defense.effectTarget({
          cells: partyState.targeting?.kind === 'cells',
          required: targetWindowOf(partyState, playerId)?.required === true,
        }),
    },
    combatChoice: {
      active: (partyState, playerId) => Boolean(choiceOf(partyState, playerId)),
      text: (partyState, playerId) =>
        HINTS.defense.combatChoice({
          movement: choiceOf(partyState, playerId)?.effect === 'movement',
        }),
    },
    noDefenseCards: {
      active: (partyState, playerId) =>
        partyState.combat?.stage === 'defense' && defenseCardIds(partyState, playerId).length === 0,
      text: HINTS.defense.noDefenseCards,
    },
    defend: {
      active: (partyState, playerId) => Boolean(isDefender(partyState, playerId)),
      text: partyState =>
        HINTS.defense.defend({ afterCancel: partyState.combat?.defenseRequired === true }),
    },
  },

  active: (partyState, playerId) =>
    isMomentMine(partyState, playerId, 'combat') &&
    (isDefender(partyState, playerId) ||
      Boolean(choiceOf(partyState, playerId)) ||
      Boolean(cardWindowOf(partyState, playerId))),

  ui(partyState, playerId, _clientContext, phase) {
    const combat = partyState.combat;
    const choice = choiceOf(partyState, playerId);
    const options = optionWindowOf(partyState, playerId);
    const target = targetWindowOf(partyState, playerId);
    // окно, открытое картой боя: подсвечиваем его кандидатов — по ним игрок и кликает
    const windowFighters = windowFighterIds(partyState, playerId);
    const windowCells = windowCellIds(partyState, playerId);

    const playable = choice
      ? choice.candidates.map(entry => String(entry.cardId))
      : options
        ? []
        : defenseCardIds(partyState, playerId);

    return {
      deck: { clickable: false },
      highlightedCellIds: windowCells,
      highlightedFighterIds:
        windowFighters.length > 0
          ? windowFighters
          : combat?.attackerFighterId == null
            ? []
            : [String(combat.attackerFighterId)],
      pickFighters: windowFighters.length > 0,
      framedFighterIds: combat?.targetFighterId == null ? [] : [String(combat.targetFighterId)],
      // варианты свойства: тексты берём с самой карты (card.options)
      choices: cardChoices(waitingCombatCard(partyState), options?.candidates ?? []),
      playableCardIds: playable,
      disabledCardIds: handCardIds(partyState, playerId).filter(
        cardId => !playable.includes(cardId),
      ),
      controls: options
        ? // окно вариантов: отметка включает общую кнопку (она и подтверждает выбор),
          // у обязательного окна без отметки кнопки нет — закрывается только выбором
          effectControls(options.picked != null || options.required !== true)
        : choice
          ? // одна общая кнопка: ничего не выбрано — отказ, выбрано — эффект заканчивается
            effectControls(canFinishChoice(choice))
          : target
            ? // окно цели: от необязательного свойства («можете убить духа») можно отказаться,
              // обязательное закрывается только выбором — кнопка выключена
              effectControls(target.required !== true)
            : resolveOkBackControls(phase, partyState, playerId),
    };
  },

  ok: {
    label: 'Закончить действие',
    enabled: (partyState, playerId) => {
      const options = optionWindowOf(partyState, playerId);
      // отметка включает кнопку: подтвердить выбор можно и в обязательном окне,
      // а отказаться (без отметки) — только в необязательном
      if (options) return options.picked != null || options.required !== true;
      const target = targetWindowOf(partyState, playerId);
      if (target) return target.required !== true;
      const choice = choiceOf(partyState, playerId);
      if (choice) return canFinishChoice(choice);
      // замену защиты пасовать нельзя: карта есть — защитник обязан выложить другую
      if (partyState.combat?.defenseRequired === true) return false;
      return isDefender(partyState, playerId);
    },
    onPress: (partyState, action) => {
      const options = optionWindowOf(partyState, action.playerId);
      if (options) {
        // выбор отмечен — общая кнопка его подтверждает и доигрывает свойство
        if (options.picked != null) return confirmOption(partyState, action.playerId);
        if (options.required === true) {
          throw new Error('UI_OK: обязательное свойство карты закрывается только выбором варианта');
        }
        return declineOption(partyState, action.playerId);
      }

      const target = targetWindowOf(partyState, action.playerId);
      if (target) {
        if (target.required === true) {
          throw new Error('UI_OK: обязательное свойство карты закрывается только выбором цели');
        }
        return declineOption(partyState, action.playerId);
      }

      return choiceOf(partyState, action.playerId)
        ? answerChoice(partyState, action, 'skip')
        : answerDefense(partyState, { playerId: action.playerId, cardId: null });
    },
  },

  back: {
    visible: () => false,
    enabled: () => false,
  },

  moves: {
    PICK: (partyState, action) => {
      if (optionWindowOf(partyState, action.playerId)) {
        if (action.kind !== 'option') {
          throw new Error(`PICK: в окне эффекта выбирают вариант (пришло "${action.kind}")`);
        }
        return pickOption(partyState, action.playerId, action.id);
      }

      // окно цели, открытое картой боя: клик по бойцу или клетке из подсвеченных
      if (cardWindowOf(partyState, action.playerId)) {
        return answerTargeting(partyState, action.playerId, action);
      }

      if (choiceOf(partyState, action.playerId)) {
        if (action.kind !== 'card') {
          throw new Error(`PICK: в паузе эффекта выбирают карту руки (пришло "${action.kind}")`);
        }
        return answerChoice(partyState, action, 'pick');
      }

      if (action.kind !== 'card') {
        throw new Error(`PICK: в защите доступен клик по карте защиты (пришло "${action.kind}")`);
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
    applied | skipped | waiting | declined). Игрок кликает карту руки (SET_COMBAT pick) или отказывается
    (SET_COMBAT skip), после чего бой продолжается с того же места.
 5a. выбор варианта эффекта («активировать катушки» или «деактивировать»): правило открывает обычное окно
    выбора с kind: 'options', клиент рисует варианты из ui.choices. Клик по варианту только **отмечает** его
    (PICK kind: 'option' → targeting.picked): правила карты применяет общая кнопка (UI_OK), она и разбирает
    момент picked — там ветки правил проверяют выбранное через PICKED { is: '...' } — затем окно закрывается
    и бой доигрывается. Отметка включает кнопку, в том числе у обязательного окна; у необязательного окна
    без отметки та же кнопка отказывается от свойства (шаг помечается declined), обязательное закрывается
    только отметкой.
 5b. выбор цели картой боя (kind: 'fighters' | 'cells'): так «Плата пеплом» спрашивает, какого духа сжечь,
    а «Счёт ударов» — кого добить в области Ифрита. Клик по подсвеченному бойцу или клетке (PICK) прогоняет
    picked, окно закрывается и бой доигрывается; у необязательного окна общая кнопка помечает шаг declined,
    обязательное закрывается только выбором.
 6. Если после урона и эффектов живой сторон осталось не больше одной — партия завершается (hook = gameEnd,
    winner). Проверка победы откладывается, пока бой не закрыт: действие доигрывается до конца, эффекты обеих
    карт срабатывают, и только потом объявляется итог (если погибли все герои — побеждает активный игрок).
 7. Эффекты карт разыгрываются правилами самой карты (card.rules): общий исполнитель — shared/rules/run.js,
    очередь и порядок окон боя — shared/cards/run.js.
 */
