import { HINTS } from '#shared/constants/hints.js';
import { findFighter, findPlayer } from '#shared/helpers/base.js';
import { isCombatParticipant } from '#shared/helpers/combat.js';

const playerName = (partyState, playerId) =>
  findPlayer(partyState, playerId)?.name ?? String(playerId ?? '—');

/** Боец с именем его игрока: «Амат (Элизиф)». В сводке боя так называют обе стороны. */
const fighterLabel = (partyState, fighterId) => {
  if (fighterId == null) return null;
  const { player, fighter } = findFighter(partyState, fighterId);
  if (!fighter) return String(fighterId);
  const owner = player?.name ?? player?.id;
  return owner == null
    ? String(fighter.name ?? fighter.id)
    : `${fighter.name ?? fighter.id} (${owner})`;
};

/**
 * Числа боя для сводки: пока карты не вскрыты, проекция их не отдаёт даже своим — тогда null,
 * и сводка честно говорит только стороны.
 */
const combatNumbers = combat => {
  if (combat?.attackValue == null || combat?.defenseValue == null) return null;
  const damage = Math.max(0, Number(combat.attackValue) - Number(combat.defenseValue));
  return `${Number(combat.attackValue)} против ${Number(combat.defenseValue)}, урон ${damage}`;
};

/**
 * Сторона боя словами: боец с игроком, а пока боец не выбран — сам игрок («Медуза»).
 * Без этого сводка начиналась бы с «null».
 */
const sideLabel = (partyState, fighterId, playerId) =>
  fighterLabel(partyState, fighterId) ?? playerName(partyState, playerId);

export default {
  name: 'waiting',

  hints: {
    /**
     * Чужая битва: полное окно битвы открыто только её участникам, остальные читают сводку строкой.
     * Стоит первым: про саму битву важнее, чем про паузу внутри неё.
     */
    battle: {
      active: (partyState, playerId) =>
        Boolean(partyState.combat) && !isCombatParticipant(partyState, playerId),
      text: partyState =>
        HINTS.waiting.battle({
          attacker: sideLabel(
            partyState,
            partyState.combat?.attackerFighterId,
            partyState.combat?.attackerPlayerId,
          ),
          defender: sideLabel(
            partyState,
            partyState.combat?.targetFighterId,
            partyState.combat?.defenderPlayerId,
          ),
          numbers: combatNumbers(partyState.combat),
        }),
    },
    waitingMovement: {
      active: partyState => Boolean(partyState.movement),
      text: partyState =>
        HINTS.waiting.waitingMovement({
          name: playerName(partyState, partyState.movement?.playerId),
        }),
    },
    // пауза эффекта у другого игрока: он выбирает карту из своей руки, остальные ждут
    waitingChoice: {
      active: partyState => Boolean(partyState.combat?.choice),
      text: partyState =>
        HINTS.waiting.waitingChoice({
          name: playerName(partyState, partyState.combat?.choice?.playerId),
        }),
    },
    waitingTurn: {
      active: () => true,
      text: partyState =>
        HINTS.waiting.waitingTurn({ name: playerName(partyState, partyState.turn?.playerId) }),
    },
  },

  active: (partyState, playerId) => String(partyState.turn?.playerId ?? '') !== String(playerId),

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
 2. Подсказка сверху: идёт чужая битва — сводка по ней (полное окно битвы видят только её участники), иначе при открытом перемещении — — «Ждём перемещения бойцов: <имя>», иначе «Ход игрока <имя>».
 3. Ходов (moves) у фазы нет, поэтому core отклонит любое действие ожидающего игрока.
 */
