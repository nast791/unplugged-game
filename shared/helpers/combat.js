import {
  findCardInZone,
  findOwnedFighter,
  findPlayer,
  isTeamFormat,
} from '#shared/helpers/base.js';
import { bfsDistance } from '#shared/helpers/board.js';
import { isAttackCard } from '#shared/helpers/cards.js';

const attackRangeOf = fighter => Number(fighter?.attackRange ?? 1);

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

const canReach = (partyState, attacker, fighter) =>
  bfsDistance(
    partyState.map?.nodes ?? [],
    attacker.currentPosition,
    fighter.currentPosition,
    attackRangeOf(attacker),
  ) <= attackRangeOf(attacker);

/**
 * Бойцы игрока, которые могут атаковать этой картой.
 * Привязка card.fighter сужает выбор до одного бойца.
 */
export const attackCandidates = (partyState, playerId, card) => {
  if (!isAttackCard(card)) return [];

  const player = findPlayer(partyState, playerId);
  if (!player) return [];

  const bound = card?.fighter != null ? String(card.fighter) : null;
  const enemies = enemiesOf(partyState, playerId);

  return (player.fighters ?? [])
    .filter(isReady)
    .filter(fighter => bound == null || String(fighter.id) === bound)
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
  if (attackCandidates(partyState, playerId, card).length === 0) {
    return 'никто из бойцов не достаёт врага этой картой';
  }

  return null;
};
