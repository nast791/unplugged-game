import { SET_CARDS } from '#shared/actions-new/cards.js';
import { SET_HEALTH } from '#shared/actions-new/health.js';
import {
  findCardInZone,
  findPlayer,
  takeCardFromZone,
} from '#shared/helpers/base.js';
import {
  cardKey,
  cardValue,
  isAttackCard,
  isDefenseCard,
} from '#shared/helpers/cards.js';
import {
  attackCandidates,
  attackTargets,
  combatOutcome,
} from '#shared/helpers/combat.js';

const playerIdOf = (partyState, action) =>
  action.playerId ?? partyState.turn?.playerId;

/** Объявление атаки: карта из руки уходит в закрытую (в сброс попадёт при закрытии боя). */
const openCombat = (partyState, action) => {
  if (partyState.combat) throw new Error('SET_COMBAT: бой уже идёт');

  const playerId = playerIdOf(partyState, action);
  if (playerId == null) throw new Error('SET_COMBAT: нужен playerId');

  const player = findPlayer(partyState, playerId);
  if (!player) throw new Error(`SET_COMBAT: игрок ${playerId} не найден`);
  if (action.cardId == null) throw new Error('SET_COMBAT: нужен cardId');

  const card = findCardInZone(player.hand, action.cardId);
  if (!card) throw new Error(`SET_COMBAT: карты "${action.cardId}" нет в руке`);
  if (!isAttackCard(card)) {
    throw new Error(`SET_COMBAT: карта "${action.cardId}" не атакует`);
  }

  const candidates = attackCandidates(partyState, playerId, card);
  if (candidates.length === 0) {
    throw new Error('SET_COMBAT: никто из бойцов не достаёт врага этой картой');
  }

  const bound = card.fighter != null ? String(card.fighter) : null;
  const attackerFighterId =
    bound ?? (candidates.length === 1 ? candidates[0].fighterId : null);

  takeCardFromZone(player.hand, action.cardId);

  partyState.combat = {
    stage: attackerFighterId ? 'target' : 'attacker',
    attackerPlayerId: String(playerId),
    defenderPlayerId: null,
    attackerFighterId,
    targetFighterId: null,
    attackCard: card,
    defenseCard: null,
    attackValue: cardValue(card),
  };
  return partyState;
};

/** Выбор атакующего, когда карту могут применить несколько своих бойцов. */
const pickCombatAttacker = (partyState, action) => {
  const combat = partyState.combat;
  if (!combat) throw new Error('SET_COMBAT: бой не идёт');
  if (combat.stage !== 'attacker') {
    throw new Error(
      `SET_COMBAT: атакующий уже определён (stage "${combat.stage}")`,
    );
  }

  const candidates = attackCandidates(
    partyState,
    combat.attackerPlayerId,
    combat.attackCard,
  );
  const chosen = candidates.find(
    entry => String(entry.fighterId) === String(action.fighterId),
  );
  if (!chosen) {
    throw new Error(
      `SET_COMBAT: боец "${action.fighterId}" не может атаковать этой картой`,
    );
  }

  combat.attackerFighterId = chosen.fighterId;
  combat.stage = 'target';
  return partyState;
};

/** Выбор цели: дальше бой ждёт защиту. */
const pickCombatTarget = (partyState, action) => {
  const combat = partyState.combat;
  if (!combat) throw new Error('SET_COMBAT: бой не идёт');
  if (combat.stage !== 'target') {
    throw new Error(
      `SET_COMBAT: цель выбирается на stage "target" (сейчас "${combat.stage}")`,
    );
  }

  const targets = attackTargets(
    partyState,
    combat.attackerPlayerId,
    combat.attackerFighterId,
  );
  const chosen = targets.find(
    entry => String(entry.fighterId) === String(action.fighterId),
  );
  if (!chosen) {
    throw new Error(`SET_COMBAT: цель "${action.fighterId}" недоступна`);
  }

  combat.targetFighterId = chosen.fighterId;
  combat.defenderPlayerId = chosen.playerId;
  combat.stage = 'defense';
  return partyState;
};

const combatAt = (partyState, stage) => {
  const combat = partyState.combat;
  if (!combat) throw new Error('SET_COMBAT: бой не идёт');
  if (combat.stage !== stage) {
    throw new Error(
      `SET_COMBAT: шаг "${stage}" недоступен на stage "${combat.stage}"`,
    );
  }
  return combat;
};

/** Ответ защитника: карта defense|hybrid либо пас (защита 0). Действий не тратит. */
const setDefense = (partyState, action) => {
  const combat = combatAt(partyState, 'defense');

  const defenderId = combat.defenderPlayerId;
  const playerId = playerIdOf(partyState, action);
  if (playerId == null || String(playerId) !== String(defenderId)) {
    throw new Error(`SET_COMBAT: защищается игрок ${defenderId}`);
  }

  const defender = findPlayer(partyState, defenderId);
  if (!defender) throw new Error(`SET_COMBAT: игрок ${defenderId} не найден`);

  combat.defendedWithCard = false;
  combat.defenseCard = null;
  combat.defenseValue = 0;

  if (action.cardId != null) {
    const card = findCardInZone(defender.hand, action.cardId);
    if (!card) {
      throw new Error(
        `SET_COMBAT: карты "${action.cardId}" нет в руке защитника`,
      );
    }
    if (!isDefenseCard(card)) {
      throw new Error(`SET_COMBAT: карта "${action.cardId}" не защищает`);
    }

    takeCardFromZone(defender.hand, action.cardId);
    combat.defenseCard = card;
    combat.defenseValue = cardValue(card);
    combat.defendedWithCard = true;
  }

  combat.stage = 'reveal';
  return partyState;
};

/** Вскрытие карт. Точка врезки эффектов «мгновенно» / «во время битвы» и усиления атаки. */
const revealCombat = partyState => {
  const combat = combatAt(partyState, 'reveal');
  combat.stage = 'resolve';
  return partyState;
};

/** Числа боя и урон. Точка врезки эффектов «после битвы». */
const resolveCombat = partyState => {
  const combat = combatAt(partyState, 'resolve');

  const outcome = combatOutcome({
    attackValue: combat.attackValue,
    defenseValue: combat.defenseValue,
  });

  partyState.lastCombat = {
    attackerPlayerId: String(combat.attackerPlayerId),
    defenderPlayerId: String(combat.defenderPlayerId),
    attackerFighterId: String(combat.attackerFighterId),
    targetFighterId: String(combat.targetFighterId),
    attackValue: outcome.attack,
    defenseValue: outcome.defense,
    combatDamage: outcome.combatDamage,
    winner: outcome.winner,
    winnerPlayerId:
      outcome.winner === 'attacker'
        ? String(combat.attackerPlayerId)
        : String(combat.defenderPlayerId),
    defendedWithCard: Boolean(combat.defendedWithCard),
    attackCardId: cardKey(combat.attackCard),
    defenseCardId:
      combat.defenseCard == null ? null : cardKey(combat.defenseCard),
  };

  if (outcome.combatDamage > 0) {
    SET_HEALTH(partyState, {
      fighterId: combat.targetFighterId,
      delta: -outcome.combatDamage,
    });
  }

  combat.stage = 'close';
  return partyState;
};

/** Закрытие боя: разыгранные карты уходят в сброс владельцев, бой снимается. */
const closeCombat = partyState => {
  const combat = combatAt(partyState, 'close');

  if (combat.attackCard) {
    SET_CARDS(partyState, {
      playerId: combat.attackerPlayerId,
      op: 'put',
      to: 'discard',
      cards: [combat.attackCard],
    });
  }
  if (combat.defenseCard) {
    SET_CARDS(partyState, {
      playerId: combat.defenderPlayerId,
      op: 'put',
      to: 'discard',
      cards: [combat.defenseCard],
    });
  }

  partyState.combat = null;
  return partyState;
};

/**
 * SET_COMBAT — бой: объявление (open → attacker → target), защита (defense), вскрытие (reveal),
 * числа и урон (resolve), закрытие боя (close).
 * params: { op, playerId?, cardId?, fighterId? }
 */
export const SET_COMBAT = (partyState, action = {}) => {
  const op = action.op ?? 'open';
  if (op === 'open') return openCombat(partyState, action);
  if (op === 'attacker') return pickCombatAttacker(partyState, action);
  if (op === 'target') return pickCombatTarget(partyState, action);
  if (op === 'defense') return setDefense(partyState, action);
  if (op === 'reveal') return revealCombat(partyState);
  if (op === 'resolve') return resolveCombat(partyState);
  if (op === 'close') return closeCombat(partyState);
  throw new Error(
    `SET_COMBAT: op "${op}" (нужны open | attacker | target | defense | reveal | resolve | close)`,
  );
};

export default SET_COMBAT;
