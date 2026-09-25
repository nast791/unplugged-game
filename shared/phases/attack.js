import { SET_COMBAT } from '#shared/actions-new/combat.js';
import { findPlayer } from '#shared/helpers/base.js';
import { attackCandidates, attackTargets } from '#shared/helpers/combat.js';
import { handCardIds, isMomentMine } from '#shared/helpers/turn.js';

const playerName = (partyState, playerId) =>
  findPlayer(partyState, playerId)?.name ?? String(playerId ?? '—');

/** Кого подсвечиваем и кого выделяем рамкой на текущей стадии боя. */
const stageFighters = (partyState, playerId, combat) => {
  if (!combat) return { highlighted: [], framed: [] };

  if (combat.stage === 'attacker') {
    const candidates = attackCandidates(
      partyState,
      playerId,
      combat.attackCard,
    ).map(entry => entry.fighterId);
    return { highlighted: candidates, framed: candidates };
  }

  const framed =
    combat.attackerFighterId == null ? [] : [String(combat.attackerFighterId)];
  const highlighted =
    combat.stage === 'target'
      ? attackTargets(partyState, playerId, combat.attackerFighterId).map(
          entry => entry.fighterId,
        )
      : combat.targetFighterId == null
        ? []
        : [String(combat.targetFighterId)];

  return { highlighted, framed };
};

export default {
  name: 'attack',

  hints: {
    pickAttacker: {
      active: partyState => partyState.combat?.stage === 'attacker',
      text: () => 'Выберите бойца, который атакует этой картой',
    },
    pickTarget: {
      active: partyState => partyState.combat?.stage === 'target',
      text: () => 'Выберите цель среди подсвеченных бойцов противника',
    },
    waitingDefense: {
      active: partyState => partyState.combat?.stage === 'defense',
      text: partyState =>
        `Ожидание защиты игрока ${playerName(partyState, partyState.combat?.defenderPlayerId)}`,
    },
  },

  active: (partyState, playerId) =>
    isMomentMine(partyState, playerId, 'combat') &&
    String(partyState.combat?.attackerPlayerId) === String(playerId) &&
    // выбор эффекта боя (например, усиление) отвечает фаза defense — она и владеет паузой
    !partyState.combat?.choice,

  ui(partyState, playerId) {
    const { highlighted, framed } = stageFighters(
      partyState,
      playerId,
      partyState.combat,
    );

    return {
      deck: { clickable: false },
      highlightedCellIds: [],
      highlightedFighterIds: highlighted,
      framedFighterIds: framed,
      playableCardIds: [],
      disabledCardIds: handCardIds(partyState, playerId),
      controls: {
        ok: { visible: false, enabled: false, label: null },
        back: { visible: false, enabled: false, label: null },
      },
    };
  },

  moves: {
    PICK: (partyState, action) => {
      if (action.kind !== 'fighter') {
        throw new Error(
          `PICK: в бою доступен клик по бойцу (пришло "${action.kind}")`,
        );
      }

      const stage = partyState.combat?.stage;
      if (stage === 'attacker') {
        return SET_COMBAT(partyState, { op: 'attacker', fighterId: action.id });
      }
      if (stage === 'target') {
        return SET_COMBAT(partyState, { op: 'target', fighterId: action.id });
      }

      throw new Error(`PICK: сейчас выбирать некого (stage "${stage ?? '—'}")`);
    },
  },
};

/*
 Фаза attack: объявление атаки и ожидание защиты (сторона атакующего).

 1. Начинается в фазе choose: клик по карте attack|hybrid, которой хоть кто-то из своих бойцов
    достаёт врага. Карта уходит из руки в закрытую (в сброс попадёт при закрытии боя), −1 действие.
 2. Если карта привязана к бойцу (card.fighter) или кандидат один — атакующий выбран сразу,
    stage = 'target'. Если кандидатов несколько — stage = 'attacker': они подсвечены, выбор кликом
    (у выбранного красная рамка).
 3. На stage = 'target' подсвечены враги в радиусе attackRange выбранного бойца; клик по врагу
    фиксирует цель и защитника, stage = 'defense'.
 4. На stage = 'defense' ход атакующего заморожен: подсказка «Ожидание защиты игрока <имя>»,
    кнопок нет, карты руки недоступны. Защита, вскрытие карт, числа и урон — следующий этап.
 5. Активна только для атакующего: у защитника своя фаза на следующем этапе, остальные — в waiting.
 */
