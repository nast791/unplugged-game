import {
  findCardInZone,
  findFighter,
  findOwnedFighter,
  findPlayer,
  isTeamFormat,
} from '#shared/helpers/base.js';
import { bfsDistance } from '#shared/helpers/board.js';
import {
  cardKey,
  fighterMatchesCard,
  hasFighterForCard,
  isAttackCard,
  isDefenseCard,
} from '#shared/helpers/cards.js';
import { combatMoments } from '#shared/constants/moments.js';
import { handCards } from '#shared/helpers/turn.js';

const attackRangeOf = fighter => Number(fighter?.attackRange ?? 1);

/** Боец, который может действовать: жив и стоит на клетке. */
const isReady = fighter =>
  Boolean(fighter) && fighter.currentPosition != null && Number(fighter.currentHp) > 0;

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
 * Достаёт ли атакующий цель: только по `attackRange` (BFS-расстояние не больше дальности).
 * Дальность 1 — ближний бой, больше — дальник; оба считаются одинаково, отдельного признака
 * «дальнего боя» нет (решение владельца: дальник тоже ориентируется на attackRange).
 */
const canReach = (partyState, attacker, fighter) => {
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
 * Привязка `card.fighter` сужает выбор: это может быть id бойца, группа помощников (три Гарпии)
 * или 'any' — без привязки. Группу как id подставлять нельзя: у Гарпий свои id (`harpies_1..3`).
 */
export const attackCandidates = (partyState, playerId, card) => {
  if (!isAttackCard(card)) return [];

  const player = findPlayer(partyState, playerId);
  if (!player) return [];

  const enemies = enemiesOf(partyState, playerId);

  return (player.fighters ?? [])
    .filter(isReady)
    .filter(fighter => fighterMatchesCard(fighter, card))
    .filter(fighter => enemies.some(entry => canReach(partyState, fighter, entry.fighter)))
    .map(fighter => ({
      fighterId: String(fighter.id),
      playerId: String(player.id),
      name: fighter.name || fighter.id,
    }));
};

/** Цели, которых выбранный боец достаёт своей attackRange. */
export const attackTargets = (partyState, playerId, attackerFighterId) => {
  const { fighter: attacker } = findOwnedFighter(partyState, playerId, attackerFighterId);
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
 * Очередь эффектов боя: по моментам боя (immediately → duringCombat → afterCombat), по сторонам
 * (защитник → атакующий) и по правилам карты — **шаг на каждое правило**. Шаг на правило нужен потому,
 * что правило может открыть паузу (выбор, перемещение) и ждать её конца, а следующее правило того же
 * момента начинается своим шагом: два ожидания в одном шаге не уживаются (`tesla_08`: сначала толчок
 * бойца противника, потом выбор катушек). В очередь попадают только карты, у которых в этом моменте
 * есть правило. Статус шага: pending → applied | skipped | waiting | declined | cancelled.
 */
export const buildCombatEffects = combat => {
  const effects = [];

  for (const moment of combatMoments) {
    for (const entry of combatSides) {
      const card = combat?.[entry.cardKey];
      const rules = (card?.rules ?? []).filter(rule => rule.moment === moment);
      if (rules.length === 0) continue;

      const playerId = combat[entry.playerKey];

      for (let index = 0; index < rules.length; index += 1) {
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
  }

  return effects;
};

/**
 * Ключи уже отработавших шагов очереди: сторона + момент + карта + номер шага внутри этой группы.
 * Нужно замене защиты: очередь пересобирается под новую карту, а уже сыгранные шаги повторять нельзя.
 */
export const consumedEffectKeys = effects => {
  const seen = new Map();
  const done = new Set();

  for (const entry of effects ?? []) {
    const key = `${entry.side}|${entry.moment}|${entry.cardId}`;
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    if (entry.status !== 'pending' && entry.status !== 'waiting') done.add(`${key}|${index}`);
  }

  return done;
};

/** Пометить в пересобранной очереди шаги, которые уже отработали в прежней: они не повторяются. */
export const restoreConsumedEffects = (effects, done) => {
  const seen = new Map();

  for (const entry of effects) {
    const key = `${entry.side}|${entry.moment}|${entry.cardId}`;
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    if (done.has(`${key}|${index}`)) entry.status = 'applied';
  }

  return effects;
};

/**
 * Карты руки, которыми игрок может защититься в открытом бою: тип подходит (защита или гибрид)
 * и карта — за того бойца, которого атакуют. Нужна и фазе защиты, и замене защиты
 * («Амат разрывает»): экшен сам решает, есть ли защитнику чем меняться.
 */
export const defenseCardIds = (partyState, playerId) => {
  const target = partyState?.combat?.targetFighterId;
  const defender = target == null ? null : (findFighter(partyState, target).fighter ?? null);

  return handCards(partyState, playerId)
    .filter(isDefenseCard)
    .filter(card => fighterMatchesCard(defender, card))
    .map(cardKey);
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
