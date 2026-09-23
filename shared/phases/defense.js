import { SET_COMBAT } from '#shared/actions-new/combat.js';
import { resolveOkBackControls } from '#shared/helpers/base.js';
import { cardKey, isDefenseCard } from '#shared/helpers/cards.js';
import {
  endGameIfFinished,
  handCardIds,
  handCards,
  isMomentMine,
} from '#shared/helpers/turn.js';

/** Карты руки, которыми можно защититься. */
const defenseCardIds = (partyState, playerId) =>
  handCards(partyState, playerId).filter(isDefenseCard).map(cardKey);

/** Ответ защитника (карта или пас), затем вскрытие, числа, урон и закрытие боя. */
const answerDefense = (partyState, action) => {
  let state = SET_COMBAT(partyState, {
    op: 'defense',
    playerId: action.playerId,
    cardId: action.cardId ?? null,
  });
  state = SET_COMBAT(state, { op: 'reveal' });
  state = SET_COMBAT(state, { op: 'resolve' });
  state = SET_COMBAT(state, { op: 'close' });

  return endGameIfFinished(state);
};

const isDefender = (partyState, playerId) =>
  partyState.combat?.stage === 'defense' &&
  String(partyState.combat?.defenderPlayerId) === String(playerId);

export default {
  name: 'defense',

  hints: {
    noDefenseCards: {
      active: (partyState, playerId) =>
        defenseCardIds(partyState, playerId).length === 0,
      text: () => 'Карт защиты нет: закончите действие — защита 0 и весь урон по бойцу',
    },
    defend: {
      active: () => true,
      text: () =>
        'Защититесь картой defense|hybrid или закончите действие без карты',
    },
  },

  active: (partyState, playerId) =>
    isMomentMine(partyState, playerId, 'combat') &&
    isDefender(partyState, playerId),

  ui(partyState, playerId, _clientContext, phase) {
    const combat = partyState.combat;
    const playable = defenseCardIds(partyState, playerId);

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
      controls: resolveOkBackControls(phase, partyState, playerId),
    };
  },

  ok: {
    label: 'Закончить действие',
    enabled: (partyState, playerId) => isDefender(partyState, playerId),
    onPress: (partyState, action) =>
      answerDefense(partyState, { playerId: action.playerId, cardId: null }),
  },

  back: {
    visible: () => false,
    enabled: () => false,
  },

  moves: {
    PICK: (partyState, action) => {
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
 Фаза defense: ответ защитника на объявленную атаку.

 1. Активна, пока бой на stage = 'defense' и игрок — защитник (только он может отвечать).
 2. Подсказка сверху: если карт защиты в руке нет — «Карт защиты нет: закончите действие —
    защита 0 и весь урон по бойцу», иначе «Защититесь картой defense|hybrid или закончите действие».
 3. клик по карте defense|hybrid (playableCardIds) — карта уходит в слот защиты, дальше сразу:
    вскрытие → числа max(0, attackValue − defenseValue) → урон по цели → закрытие боя
    (обе карты в сброс владельцев, lastCombat для UI и лога).
 4. Кнопка «Закончить действие» — пас: защита 0, весь урон по бойцу. Своих действий защитник не тратит.
 5. Если после урона живой сторон осталось не больше одной — партия завершается (hook = gameEnd, winner).
 6. Эффекты карт («мгновенно» / «во время битвы» / «после битвы») и усиление атаки — следующие этапы:
    их точки врезки помечены в SET_COMBAT (reveal и resolve).
 */
