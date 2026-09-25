import {
  findCardInZone,
  findOwnedFighter,
  findPlayer,
  isTeamFormat,
} from '#shared/helpers/base.js';
import { bfsDistance } from '#shared/helpers/board.js';
import {
  cardFighterId,
  cardKey,
  fighterMatchesCard,
  hasFighterForCard,
  isAttackCard,
} from '#shared/helpers/cards.js';
import { sharesArea } from '#shared/helpers/placement.js';
import { combatMoments } from '#shared/constants/moments.js';

const attackRangeOf = fighter => Number(fighter?.attackRange ?? 1);

/** Боец дальнего боя (attackType: 'ranged') бьёт по зонам, а не по расстоянию. */
const isRangedFighter = fighter => String(fighter?.attackType ?? '') === 'ranged';

/** Боец, который может действовать: жив и стоит на клетке. */
const isReady = fighter =>
  Boolean(fighter) &&
  fighter.currentPosition != null &&
  Number(fighter.currentHp) > 0;

const isEnemyPlayer = (partyState, playerId, other) => {
  if (String(other.id) === String(playerId)) return false;
  if (!isTeamFormat(partyState)) return true;
  return String(other.team) !== String(findPlayer(partyState, playerId)?.team);
};

const enemiesOf = (partyState, playerId) => {
  const out = [];
  for (const other of partyState?.players ?? []) {
    if (!isEnemyPlayer(partyState, playerId, other)) continue;
    for (const fighter of other.fighters ?? []) {
      if (isReady(fighter)) out.push({ player: other, fighter });
    }
  }
  return out;
};

/**
 * Достаёт ли атакующий цель.
 * Ближний — по attackRange: соседние клетки (BFS-расстояние не больше дальности).
 * Дальний — по зоне: любая цель в одной области с ним, расстояние внутри зоны не ограничено
 * (многоцветная клетка считается сразу во всех своих зонах). Ближний предел при этом сохраняется.
 */
const canReach = (partyState, attacker, fighter) => {
  if (
    isRangedFighter(attacker) &&
    sharesArea(partyState, attacker.currentPosition, fighter.currentPosition)
  ) {
    return true;
  }

  const range = attackRangeOf(attacker);
  return (
    bfsDistance(
      partyState.map?.nodes ?? [],
      attacker.currentPosition,
      fighter.currentPosition,
      range,
    ) <= range
  );
};

/**
 * Бойцы игрока, которые могут атаковать этой картой.
 * Привязка `card.fighter` сужает выбор до одного бойца ('any' — без привязки).
 */
export const attackCandidates = (partyState, playerId, card) => {
  if (!isAttackCard(card)) return [];

  const player = findPlayer(partyState, playerId);
  if (!player) return [];

  const bound = cardFighterId(card);
  const enemies = enemiesOf(partyState, playerId);

  return (player.fighters ?? [])
    .filter(isReady)
    .filter(fighter => bound == null || fighterMatchesCard(fighter, card))
    .filter(fighter =>
      enemies.some(entry => canReach(partyState, fighter, entry.fighter)),
    )
    .map(fighter => ({
      fighterId: String(fighter.id),
      playerId: String(player.id),
      name: fighter.name || fighter.id,
    }));
};

/** Цели, которых выбранный боец достаёт своей attackRange. */
export const attackTargets = (partyState, playerId, attackerFighterId) => {
  const { fighter: attacker } = findOwnedFighter(
    partyState,
    playerId,
    attackerFighterId,
  );
  if (!isReady(attacker)) return [];

  return enemiesOf(partyState, playerId)
    .filter(entry => canReach(partyState, attacker, entry.fighter))
    .map(entry => ({
      fighterId: String(entry.fighter.id),
      playerId: String(entry.player.id),
      name: entry.fighter.name || entry.fighter.id,
    }));
};

/** Стороны боя в порядке разыгрывания эффектов: сначала защитник, потом атакующий. */
export const combatSides = [
  { side: 'defender', playerKey: 'defenderPlayerId', cardKey: 'defenseCard' },
  { side: 'attacker', playerKey: 'attackerPlayerId', cardKey: 'attackCard' },
];

/**
 * Очередь эффектов боя: по моментам боя (immediately → duringCombat → afterCombat) и по сторонам
 * (защитник → атакующий). В очередь попадают только карты, у которых в этом моменте есть правило, —
 * остальные в бою ничего не делают. Статус шага: pending → applied | skipped | waiting | declined.
 */
export const buildCombatEffects = combat => {
  const effects = [];

  for (const moment of combatMoments) {
    for (const entry of combatSides) {
      const card = combat?.[entry.cardKey];
      if (!card?.rules?.some(rule => rule.moment === moment)) continue;

      const playerId = combat[entry.playerKey];
      effects.push({
        order: effects.length + 1,
        moment,
        side: entry.side,
        cardId: cardKey(card),
        playerId: playerId == null ? null : String(playerId),
        status: 'pending',
      });
    }
  }

  return effects;
};

/** Участвует ли игрок в текущем бою (атакующий или защитник). */
export const isCombatParticipant = (partyState, playerId) => {
  const combat = partyState?.combat;
  if (!combat || playerId == null) return false;
  return [combat.attackerPlayerId, combat.defenderPlayerId].some(
    id => id != null && String(id) === String(playerId),
  );
};

/** Итог боя по числам карт: урон = атака − защита, победитель по урону. */
export const combatOutcome = ({ attackValue = 0, defenseValue = 0 } = {}) => {
  const attack = Math.max(0, Number(attackValue) || 0);
  const defense = Math.max(0, Number(defenseValue) || 0);
  const combatDamage = Math.max(0, attack - defense);
  return {
    attack,
    defense,
    combatDamage,
    winner: combatDamage > 0 ? 'attacker' : 'defender',
  };
};

/** Почему атаку нельзя объявить; null — можно. */
export const attackRejection = (partyState, playerId, cardId) => {
  if (partyState.combat) return 'бой уже идёт';

  const player = findPlayer(partyState, playerId);
  if (!player) return `игрок ${playerId} не найден`;

  const card = findCardInZone(player.hand, cardId);
  if (!card) return `карты ${cardId} нет в руке`;
  if (!isAttackCard(card)) return `карта ${cardId} не атакует`;
  if (!hasFighterForCard(partyState, playerId, card)) {
    return `карта ${cardId} привязана к бойцу, которого нет на поле`;
  }
  if (attackCandidates(partyState, playerId, card).length === 0) {
    return 'никто из бойцов не достаёт врага этой картой';
  }

  return null;
};
