import { SET_CARDS } from '#shared/actions-new/cards.js';
import { SET_HEALTH } from '#shared/actions-new/health.js';
import {
  findCardInZone,
  findPlayer,
  takeCardFromZone,
} from '#shared/helpers/base.js';
import {
  cardBonus,
  cardFighterId,
  cardKey,
  cardValue,
  hasFighterForCard,
  isAttackCard,
  isDefenseCard,
} from '#shared/helpers/cards.js';
import {
  attackCandidates,
  attackTargets,
  buildCombatEffects,
  combatOutcome,
  isCombatParticipant,
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
  if (!hasFighterForCard(partyState, playerId, card)) {
    throw new Error(
      `SET_COMBAT: карта "${action.cardId}" привязана к бойцу, которого нет на поле`,
    );
  }

  const candidates = attackCandidates(partyState, playerId, card);
  if (candidates.length === 0) {
    throw new Error('SET_COMBAT: никто из бойцов не достаёт врага этой картой');
  }

  // привязка 'any' — без привязки: бойца выбирает игрок (или он один и берётся сам)
  const bound = cardFighterId(card);
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
    if (!hasFighterForCard(partyState, defenderId, card)) {
      throw new Error(
        `SET_COMBAT: карта "${action.cardId}" привязана к бойцу, которого нет на поле`,
      );
    }

    takeCardFromZone(defender.hand, action.cardId);
    combat.defenseCard = card;
    combat.defenseValue = cardValue(card);
    combat.defendedWithCard = true;
  }

  combat.stage = 'reveal';
  // обе карты известны: строим очередь эффектов, которую дальше разыгрывает cards/run.js
  combat.effects = buildCombatEffects(combat);
  return partyState;
};

/** Вскрытие карт. Точка врезки эффектов «мгновенно» / «во время битвы» и усиления атаки. */
const revealCombat = partyState => {
  const combat = combatAt(partyState, 'reveal');
  combat.stage = 'resolve';
  return partyState;
};

/**
 * Правка числа боя эффектом «во время боя»: бой уже вскрыт, но ещё не посчитан (stage = reveal).
 * Так усиление атаки и ослабление защиты попадают в формулу, а не после неё.
 */
const setCombatValue = (partyState, action) => {
  const combat = combatAt(partyState, 'reveal');

  const playerId = playerIdOf(partyState, action);
  if (playerId == null || !isCombatParticipant(partyState, playerId)) {
    throw new Error('SET_COMBAT: менять числа боя может только его участник');
  }

  const side = action.side;
  if (side !== 'attack' && side !== 'defense') {
    throw new Error(
      `SET_COMBAT: side "${action.side}" (нужны attack | defense)`,
    );
  }

  const delta = Number(action.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('SET_COMBAT: нужен ненулевой delta');
  }

  const field = side === 'attack' ? 'attackValue' : 'defenseValue';
  const next = (Number(combat[field]) || 0) + delta;
  if (next < 0) {
    throw new Error(`SET_COMBAT: ${side} не может стать меньше 0`);
  }

  combat[field] = next;
  return partyState;
};

/** Кандидаты выбора — карты руки: принимаем объекты HAND ({ cardId, bonus }) и просто id. */
const choiceCandidates = candidates => {
  const list = Array.isArray(candidates) ? candidates : [];

  return list
    .map(entry => {
      if (entry == null) return null;
      if (typeof entry === 'object') {
        const cardId = entry.cardId ?? entry.instanceId ?? entry.id;
        if (cardId == null) return null;
        return { cardId: String(cardId), bonus: Number(entry.bonus) || 0 };
      }
      return { cardId: String(entry), bonus: 0 };
    })
    .filter(Boolean);
};

/**
 * Отметить шаг очереди, который ждал решения игрока: сколько карт ушло на эффект и чем он кончился.
 * Шаг без выбранных карт и без отказа (например, выбор закрыло само правило) считается сработавшим.
 */
const finishWaitingEffect = (partyState, status, cards = null) => {
  const waiting = (partyState.combat?.effects ?? []).find(
    entry => entry.status === 'waiting',
  );
  if (!waiting) return;

  waiting.status = status;
  if (cards) waiting.cards = [...(waiting.cards ?? []), ...cards];
};

/** Закрыть выбор: шаг очереди получает итог, пауза снимается. */
const closeCombatChoice = (partyState, status) => {
  const combat = partyState.combat;
  const choice = combat?.choice;
  if (!choice) return partyState;

  finishWaitingEffect(partyState, status, choice.picked);
  combat.choice = null;
  return partyState;
};

/**
 * Пауза боя для перемещения: правило открыло черновик перемещения (`SET_MOVEMENT open`
 * с эффекта карты), значит бой ждёт, пока игрок подвигал бойцов и закончил эффект.
 * Дальше черновик живёт своей жизнью, а пауза помнит, кого и на сколько можно двигать.
 */
export const openMovementChoice = (
  partyState,
  { playerId, source, optional = false, budget = null, fighters = null } = {},
) => {
  const combat = combatForEffect(partyState);
  if (combat.choice) throw new Error('SET_COMBAT: выбор эффекта уже открыт');

  combat.choice = {
    playerId: String(playerId),
    source: source == null ? null : String(source),
    effect: 'movement',
    side: null,
    optional: optional === true,
    budget,
    fighters,
    candidates: [],
    picked: [],
    moves: [],
  };
  return partyState;
};

/** Ходы, сделанные в перемещении от эффекта, переезжают в паузу — по ним считается итог шага. */
export const finishMovementChoice = (partyState, moves = []) => {
  const choice = partyState.combat?.choice;
  if (choice?.effect !== 'movement') return partyState;

  choice.moves = [...(choice.moves ?? []), ...moves];
  return partyState;
};

/** Бой идёт — на любой стадии, где разыгрываются эффекты карт (до расчёта и после него). */
const combatForEffect = partyState => {
  const combat = partyState.combat;
  if (!combat) throw new Error('SET_COMBAT: бой не идёт');
  if (combat.stage !== 'reveal' && combat.stage !== 'close') {
    throw new Error(
      `SET_COMBAT: выбор эффекта доступен до расчёта или после боя (stage "${combat.stage}")`,
    );
  }
  return combat;
};

/**
 * Выбор в бою (пауза): правило карты ждёт решения игрока (например, усилить атаку за сброс карты
 * или заставить врага сбросить карту).
 * `effect` — что делает выбранная карта: `bonus` (её бонус прибавляется к числу боя `side`,
 * только до расчёта) или `discard` (просто уходит в сброс). `actor` — кто выбирает, по умолчанию
 * владелец правила. Сколько карт можно потратить, решает само правило: `max` — предел,
 * без `max` — сколько угодно (выбор закрывает игрок или конец карт в руке).
 * params: { op: 'choice', effect, side?, actor?, candidates, optional?, max?, source? }
 */
const openCombatChoice = (partyState, action) => {
  const combat = combatForEffect(partyState);

  const rulePlayerId = playerIdOf(partyState, action);
  if (rulePlayerId == null || !isCombatParticipant(partyState, rulePlayerId)) {
    throw new Error('SET_COMBAT: выбор эффекта открывает только участник боя');
  }
  if (combat.choice) throw new Error('SET_COMBAT: выбор эффекта уже открыт');

  const actorId = action.actor ?? rulePlayerId;
  if (!isCombatParticipant(partyState, actorId)) {
    throw new Error('SET_COMBAT: выбирать в паузе эффекта может только участник боя');
  }

  const effect = action.effect ?? 'bonus';
  if (effect !== 'bonus' && effect !== 'discard') {
    throw new Error(
      `SET_COMBAT: effect "${action.effect}" (нужны bonus | discard)`,
    );
  }
  if (effect === 'bonus' && combat.stage !== 'reveal') {
    throw new Error('SET_COMBAT: числа боя меняют только до расчёта');
  }

  const side = action.side;
  if (effect === 'bonus' && side !== 'attack' && side !== 'defense') {
    throw new Error(
      `SET_COMBAT: side "${action.side}" (нужны attack | defense)`,
    );
  }

  const candidates = choiceCandidates(action.candidates);
  if (candidates.length === 0) {
    throw new Error('SET_COMBAT: нужны candidates (хотя бы одна карта)');
  }

  const max =
    action.max == null ? null : Math.max(1, Number(action.max) || 1);

  combat.choice = {
    playerId: String(actorId),
    source: action.source == null ? null : String(action.source),
    effect,
    side: effect === 'bonus' ? side : null,
    optional: action.optional === true,
    max,
    used: 0,
    candidates,
    picked: [],
  };
  return partyState;
};

const combatChoiceAt = (partyState, action) => {
  const combat = partyState.combat;
  if (!combat) throw new Error('SET_COMBAT: бой не идёт');

  const choice = combat.choice;
  if (!choice) throw new Error('SET_COMBAT: выбор эффекта не открыт');

  const playerId = playerIdOf(partyState, action);
  if (String(choice.playerId) !== String(playerId)) {
    throw new Error('SET_COMBAT: это чужой выбор эффекта');
  }

  return choice;
};

/**
 * Игрок выбрал карту в паузе эффекта: карта уходит в сброс, а эффект доводит выбор до конца —
 * `bonus` прибавляет её бонус к числу боя, `discard` ничего больше не делает.
 * Если правило не ограничило число карт (`max`), выбор остаётся открытым: можно взять ещё карту
 * или закончить эффект. Выбор закрывается сам, когда предел достигнут или карты кончились.
 * params: { op: 'pick', cardId }
 */
const pickCombatChoice = (partyState, action) => {
  const choice = combatChoiceAt(partyState, action);
  // числа боя меняются только до расчёта, сброс карты работает и в эффектах «после боя»
  const combat =
    choice.effect === 'bonus'
      ? combatAt(partyState, 'reveal')
      : combatForEffect(partyState);

  const chosen = choice.candidates.find(
    entry => String(entry.cardId) === String(action.cardId),
  );
  if (!chosen) {
    throw new Error(
      `SET_COMBAT: карта "${action.cardId}" не среди кандидатов выбора`,
    );
  }

  const playerId = String(choice.playerId);
  const player = findPlayer(partyState, playerId);
  const card = findCardInZone(player?.hand, action.cardId);
  if (!card) {
    throw new Error(`SET_COMBAT: карты "${action.cardId}" нет в руке`);
  }

  if (choice.effect === 'bonus') {
    const field = choice.side === 'attack' ? 'attackValue' : 'defenseValue';
    combat[field] = Math.max(
      0,
      (Number(combat[field]) || 0) + cardBonus(card),
    );
  }

  SET_CARDS(partyState, {
    playerId,
    op: 'move',
    from: 'hand',
    to: 'discard',
    cardIds: [action.cardId],
  });

  choice.used += 1;
  choice.picked = [...choice.picked, String(action.cardId)];
  choice.candidates = choice.candidates.filter(
    entry => String(entry.cardId) !== String(action.cardId),
  );

  const limitReached = choice.max != null && choice.used >= choice.max;
  if (limitReached || choice.candidates.length === 0) {
    return closeCombatChoice(partyState, 'applied');
  }

  return partyState;
};

/**
 * Конец эффекта: игрок больше не тратит карты и не двигает бойцов. Если он уже что-то сделал —
 * эффект сработал, если нет — это отказ (и только у необязательного эффекта).
 */
const skipCombatChoice = (partyState, action) => {
  const choice = combatChoiceAt(partyState, action);
  const used = (Number(choice.used) || 0) + (choice.moves?.length ?? 0);
  if (used === 0 && !choice.optional) {
    throw new Error('SET_COMBAT: от этого эффекта нельзя отказаться');
  }

  return closeCombatChoice(partyState, used > 0 ? 'applied' : 'declined');
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

/** Разыгранные карты боя уходят в сброс владельцев. */
const discardCombatCards = (partyState, combat) => {
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
};

/** Закрытие боя: разыгранные карты уходят в сброс владельцев, бой снимается. */
const closeCombat = partyState => {
  const combat = combatAt(partyState, 'close');

  discardCombatCards(partyState, combat);
  partyState.combat = null;
  return partyState;
};

/**
 * Отмена боя на любой стадии: например, участник сдался. Карты просто уходят в сброс,
 * числа и урон не считаются, lastCombat не трогаем — бой не состоялся.
 */
const cancelCombat = (partyState, action) => {
  const combat = partyState.combat;
  if (!combat) return partyState;

  const playerId = playerIdOf(partyState, action);
  if (playerId != null && !isCombatParticipant(partyState, playerId)) {
    throw new Error('SET_COMBAT: отменить бой может только его участник');
  }

  discardCombatCards(partyState, combat);
  partyState.combat = null;
  return partyState;
};

/**
 * SET_COMBAT — бой: объявление (open → attacker → target), защита (defense), вскрытие (reveal),
 * правка числа эффектом боя (value), выбор эффекта (choice → pick | skip), числа и урон (resolve),
 * закрытие боя (close) и отмена (cancel).
 * params: { op, playerId?, cardId?, fighterId?, side?, delta?, effect?, actor?, candidates?, optional?, max?, source? }
 */
export const SET_COMBAT = (partyState, action = {}) => {
  const op = action.op ?? 'open';
  if (op === 'open') return openCombat(partyState, action);
  if (op === 'attacker') return pickCombatAttacker(partyState, action);
  if (op === 'target') return pickCombatTarget(partyState, action);
  if (op === 'defense') return setDefense(partyState, action);
  if (op === 'reveal') return revealCombat(partyState);
  if (op === 'value') return setCombatValue(partyState, action);
  if (op === 'choice') return openCombatChoice(partyState, action);
  if (op === 'pick') return pickCombatChoice(partyState, action);
  if (op === 'skip') return skipCombatChoice(partyState, action);
  if (op === 'resolve') return resolveCombat(partyState);
  if (op === 'close') return closeCombat(partyState);
  if (op === 'cancel') return cancelCombat(partyState, action);
  throw new Error(
    `SET_COMBAT: op "${op}" (нужны open | attacker | target | defense | reveal | value | choice | pick | skip | resolve | close | cancel)`,
  );
};

export default SET_COMBAT;
