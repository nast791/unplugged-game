import { SET_CARDS } from '#shared/actions/cards.js';
import { SET_HEALTH } from '#shared/actions/health.js';
import {
  findCardInZone,
  findFighter,
  findPlayer,
  setZoneCards,
  takeCardFromZone,
  zoneCards,
} from '#shared/helpers/base.js';
import {
  cardBonus,
  cardKey,
  cardValue,
  fighterMatchesCard,
  hasFighterForCard,
  isAttackCard,
  isDefenseCard,
} from '#shared/helpers/cards.js';
import {
  attackCandidates,
  attackTargets,
  buildCombatEffects,
  combatOutcome,
  consumedEffectKeys,
  defenseCardIds,
  isCombatParticipant,
  restoreConsumedEffects,
} from '#shared/helpers/combat.js';

const playerIdOf = (partyState, action) => action.playerId ?? partyState.turn?.playerId;

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
    throw new Error(`SET_COMBAT: карта "${action.cardId}" привязана к бойцу, которого нет на поле`);
  }

  const candidates = attackCandidates(partyState, playerId, card);
  if (candidates.length === 0) {
    throw new Error('SET_COMBAT: никто из бойцов не достаёт врага этой картой');
  }

  // привязка карты может быть и id героя, и группой помощников (harpies): кандидаты уже отфильтрованы
  // по ней, поэтому атакующего берём сами только когда он один, иначе его выбирает игрок
  const attackerFighterId = candidates.length === 1 ? candidates[0].fighterId : null;

  takeCardFromZone(player.hand, action.cardId);

  partyState.combat = {
    stage: 'attacker',
    attackerPlayerId: String(playerId),
    defenderPlayerId: null,
    attackerFighterId,
    targetFighterId: null,
    attackCard: card,
    defenseCard: null,
    attackValue: cardValue(card),
    // «замена защиты»: защитник обязан выложить другую карту (ставит op replaceDefense)
    defenseRequired: false,
    defenseReplaced: false,
  };

  return attackerFighterId ? chooseTargetOrDefense(partyState, partyState.combat) : partyState;
};

/**
 * Дальше либо выбор цели, либо сразу защита: цель выбирают кликом только когда их несколько,
 * единственную берём сами (иначе игрок упирается в «выберите цель», где выбора нет).
 */
const chooseTargetOrDefense = (partyState, combat) => {
  const targets = attackTargets(partyState, combat.attackerPlayerId, combat.attackerFighterId);

  if (targets.length === 1) {
    combat.targetFighterId = targets[0].fighterId;
    combat.defenderPlayerId = targets[0].playerId;
    combat.stage = 'defense';
    return partyState;
  }

  combat.stage = 'target';
  return partyState;
};

/** Выбор атакующего, когда карту могут применить несколько своих бойцов. */
const pickCombatAttacker = (partyState, action) => {
  const combat = partyState.combat;
  if (!combat) throw new Error('SET_COMBAT: бой не идёт');
  if (combat.stage !== 'attacker') {
    throw new Error(`SET_COMBAT: атакующий уже определён (stage "${combat.stage}")`);
  }

  const candidates = attackCandidates(partyState, combat.attackerPlayerId, combat.attackCard);
  const chosen = candidates.find(entry => String(entry.fighterId) === String(action.fighterId));
  if (!chosen) {
    throw new Error(`SET_COMBAT: боец "${action.fighterId}" не может атаковать этой картой`);
  }

  combat.attackerFighterId = chosen.fighterId;
  return chooseTargetOrDefense(partyState, combat);
};

/** Выбор цели: дальше бой ждёт защиту. */
const pickCombatTarget = (partyState, action) => {
  const combat = partyState.combat;
  if (!combat) throw new Error('SET_COMBAT: бой не идёт');
  if (combat.stage !== 'target') {
    throw new Error(`SET_COMBAT: цель выбирается на stage "target" (сейчас "${combat.stage}")`);
  }

  const targets = attackTargets(partyState, combat.attackerPlayerId, combat.attackerFighterId);
  const chosen = targets.find(entry => String(entry.fighterId) === String(action.fighterId));
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
    throw new Error(`SET_COMBAT: шаг "${stage}" недоступен на stage "${combat.stage}"`);
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

  // очередь могли пересобрать при замене защиты: уже отработавшие шаги повторять нельзя
  const previousEffects = combat.effects ?? [];

  combat.defendedWithCard = false;
  combat.defenseCard = null;
  combat.defenseValue = 0;
  combat.defenseRequired = false;

  if (action.cardId != null) {
    const card = findCardInZone(defender.hand, action.cardId);
    if (!card) {
      throw new Error(`SET_COMBAT: карты "${action.cardId}" нет в руке защитника`);
    }
    if (!isDefenseCard(card)) {
      throw new Error(`SET_COMBAT: карта "${action.cardId}" не защищает`);
    }
    // карта бойца играется только за этого бойца: атакуют Медузу — карта Гарпии не подходит
    const target = findFighter(partyState, combat.targetFighterId).fighter;
    if (!fighterMatchesCard(target, card)) {
      throw new Error(`SET_COMBAT: карта "${action.cardId}" не для бойца, которого атакуют`);
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
  // обе карты известны: строим очередь эффектов, которую дальше разыгрывает cards/run.js.
  // После замены защиты очередь собирается заново — под новую карту: то, что уже отработало, помечаем.
  combat.effects = restoreConsumedEffects(
    buildCombatEffects(combat),
    consumedEffectKeys(previousEffects),
  );
  return partyState;
};

/**
 * Замена защиты («Амат разрывает»): защитник сбрасывает выложенную карту и защищается другой.
 * Экшен делает всё сам, чтобы правило карты осталось одной строкой: старую защиту — в сброс,
 * число обнулить, посмотреть, есть ли у защитника чем меняться.
 * Есть — бой возвращается на шаг защиты (`stage: 'defense'`), и фаза `defense` ждёт клика защитника
 * (окно обязательное: пасовать нельзя, пока есть карта). Нет — защиты нет, бой идёт дальше с нулём.
 * Очередь эффектов пересобирается с сохранением отработавших шагов.
 */
const replaceDefense = (partyState, action) => {
  const combat = combatAt(partyState, 'reveal');

  // замена в бою одна: очередь пересобирается, и то же правило попадёт в неё снова — второй раз молчим
  if (combat.defenseReplaced === true) return partyState;

  const playerId = playerIdOf(partyState, action);
  if (playerId == null || String(playerId) !== String(combat.attackerPlayerId)) {
    throw new Error('SET_COMBAT: замену защиты объявляет атакующий');
  }

  const previousEffects = combat.effects ?? [];
  const replacedCard = combat.defenseCard;

  // выложенная карта уходит в сброс владельца (не в руку): её уже видели, второй раз она не сыграет
  if (replacedCard) {
    const discard = zoneCards(findPlayer(partyState, combat.defenderPlayerId).discard);
    discard.push(replacedCard);
    setZoneCards(findPlayer(partyState, combat.defenderPlayerId), 'discard', discard);
  }

  // снимок вскрытия, открытый заменённой картой, снимается вместе с ней: иначе карта с тем же
  // свойством («Раскройте верхнюю карту колоды противника») упрётся в «колода уже раскрыта»
  if (replacedCard && partyState.reveal != null) {
    const replacedKey = String(cardKey(replacedCard));
    const rest = (partyState.reveal ?? []).filter(
      entry => String(entry?.source ?? '') !== replacedKey,
    );
    partyState.reveal = rest.length > 0 ? rest : null;
  }

  combat.defenseCard = null;
  combat.defenseValue = 0;
  combat.defendedWithCard = false;
  combat.defenseReplaced = true;

  const canReplace = defenseCardIds(partyState, combat.defenderPlayerId).length > 0;
  combat.defenseRequired = canReplace;
  combat.stage = canReplace ? 'defense' : 'reveal';
  combat.effects = restoreConsumedEffects(
    buildCombatEffects(combat),
    consumedEffectKeys(previousEffects),
  );

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
 * `delta` прибавляется к числу, `to` задаёт число целиком (свойство вида «атака этой карты равна 5»).
 * Сторона — числом (`attack` | `defense`) или картой боя (`self` | `opponent` | `attacker` | `defender`):
 * «карта оппонента» — это защита, если я атакую, и атака, если атакуют меня.
 * Уже добавленные к числу бонусы при этом сохраняются — правило меняет только само число карты.
 * params: { op: 'value', side, delta?, to? }
 */
const setCombatValue = (partyState, action) => {
  const combat = combatAt(partyState, 'reveal');

  const playerId = playerIdOf(partyState, action);
  if (playerId == null || !isCombatParticipant(partyState, playerId)) {
    throw new Error('SET_COMBAT: менять числа боя может только его участник');
  }

  const side = valueSideOf(partyState, action);
  const field = side === 'attack' ? 'attackValue' : 'defenseValue';

  if (action.to != null) {
    if (action.delta != null) {
      throw new Error('SET_COMBAT: нужно что-то одно — delta или to');
    }
    const to = Number(action.to);
    if (!Number.isFinite(to) || to < 0) {
      throw new Error('SET_COMBAT: to должно быть неотрицательным числом');
    }
    combat[field] = to;
    return partyState;
  }

  const delta = Number(action.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('SET_COMBAT: нужен ненулевой delta или to');
  }

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
  const waiting = (partyState.combat?.effects ?? []).find(entry => entry.status === 'waiting');
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

/**
 * Сторона боя, эффекты которой отменяем. Имена — по картам ('attacker' | 'defender', как в очереди боя),
 * а не по числам: `op: 'value'` меняет число ('attack' | 'defense'), а отмена выключает всю карту.
 * 'self' | 'opponent' считаются от владельца правила.
 */
const targetSideOf = (partyState, action) => {
  const playerId = playerIdOf(partyState, action);
  if (playerId == null || !isCombatParticipant(partyState, playerId)) {
    throw new Error('SET_COMBAT: отменять эффекты может только участник боя');
  }

  const side = action.side;
  if (side === 'attacker' || side === 'defender') return side;

  const isAttacker = String(partyState.combat.attackerPlayerId) === String(playerId);
  const own = isAttacker ? 'attacker' : 'defender';
  const other = isAttacker ? 'defender' : 'attacker';

  if (side === 'self') return own;
  if (side === 'opponent') return other;

  throw new Error(
    `SET_COMBAT: side "${action.side}" (нужны opponent | self | attacker | defender)`,
  );
};

/**
 * Отмена эффектов карты противника («мгновенно»): правила этой стороны в бою больше не разыгрываются —
 * очередь помечает её шаги `cancelled`, числа карты при этом не меняются (отменяются тексты, не значение).
 * Порядок окон решает, что успело сработать: защитник играет раньше, поэтому отмена защитника
 * накрывает все эффекты атакующего, а отмена атакующего — только те его окна, что ещё не разыграны.
 * params: { op: 'cancelEffects', side }
 */
const cancelCombatEffects = (partyState, action) => {
  const combat = combatForEffect(partyState);
  const side = targetSideOf(partyState, action);

  combat.cancelled = { ...(combat.cancelled ?? {}), [side]: true };
  return partyState;
};

/**
 * Сторона числа боя: `attack` | `defense` задают число напрямую, а `self` | `opponent` | `attacker` | `defender` —
 * через карту боя (`targetSideOf`). Так пишется свойство «значение карты оппонента становится 0», которое
 * работает и когда я атакую (речь о защите), и когда атакую меня (речь об атаке).
 */
const valueSideOf = (partyState, action) => {
  if (action.side === 'attack' || action.side === 'defense') return action.side;
  return targetSideOf(partyState, action) === 'attacker' ? 'attack' : 'defense';
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
    throw new Error(`SET_COMBAT: effect "${action.effect}" (нужны bonus | discard)`);
  }
  if (effect === 'bonus' && combat.stage !== 'reveal') {
    throw new Error('SET_COMBAT: числа боя меняют только до расчёта');
  }

  const side = action.side;
  if (effect === 'bonus' && side !== 'attack' && side !== 'defense') {
    throw new Error(`SET_COMBAT: side "${action.side}" (нужны attack | defense)`);
  }

  const candidates = choiceCandidates(action.candidates);
  if (candidates.length === 0) {
    throw new Error('SET_COMBAT: нужны candidates (хотя бы одна карта)');
  }

  const max = action.max == null ? null : Math.max(1, Number(action.max) || 1);

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
    choice.effect === 'bonus' ? combatAt(partyState, 'reveal') : combatForEffect(partyState);

  const chosen = choice.candidates.find(entry => String(entry.cardId) === String(action.cardId));
  if (!chosen) {
    throw new Error(`SET_COMBAT: карта "${action.cardId}" не среди кандидатов выбора`);
  }

  const playerId = String(choice.playerId);
  const player = findPlayer(partyState, playerId);
  const card = findCardInZone(player?.hand, action.cardId);
  if (!card) {
    throw new Error(`SET_COMBAT: карты "${action.cardId}" нет в руке`);
  }

  if (choice.effect === 'bonus') {
    const field = choice.side === 'attack' ? 'attackValue' : 'defenseValue';
    combat[field] = Math.max(0, (Number(combat[field]) || 0) + cardBonus(card));
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
    defenseCardId: combat.defenseCard == null ? null : cardKey(combat.defenseCard),
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

/**
 * Разыгранные карты боя уходят в сброс владельцев.
 * Возвращённую карту (например, «Вечный огонь» ифрита: `RECALL_PLAYED_CARD` в окне «после битвы»)
 * закрытие боя не сбрасывает — она уже ушла в руку владельца, и в бою помечена как `recalled`.
 */
const discardCombatCards = (partyState, combat) => {
  if (combat.attackCard && combat.recalled?.attackCard !== true) {
    SET_CARDS(partyState, {
      playerId: combat.attackerPlayerId,
      op: 'put',
      to: 'discard',
      cards: [combat.attackCard],
    });
  }
  if (combat.defenseCard && combat.recalled?.defenseCard !== true) {
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
  // Отчёт боя: разрешённая очередь свойств остаётся в `lastCombat` — видно, что сработало, что отменили
  // и от чего отказались. `combat` дальше снимается, поэтому статусы шагов сохраняем здесь.
  if (partyState.lastCombat) {
    partyState.lastCombat = {
      ...partyState.lastCombat,
      effects: (combat.effects ?? []).map(step => ({ ...step })),
    };
  }
  partyState.combat = null;
  // раскрытые карты — публичный снимок этой битвы: бой кончился, снимок снимается
  partyState.reveal = null;
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
  partyState.reveal = null;
  return partyState;
};

/**
 * SET_COMBAT — бой: объявление (open → attacker → target), защита (defense), вскрытие (reveal),
 * правка числа эффектом боя (value), отмена эффектов карты противника (cancelEffects),
 * выбор эффекта (choice → pick | skip), числа и урон (resolve), закрытие боя (close) и отмена (cancel).
 * params: { op, playerId?, cardId?, fighterId?, side?, delta?, to?, effect?, actor?, candidates?, optional?, max?, source? }
 */
export const SET_COMBAT = (partyState, action = {}) => {
  const op = action.op ?? 'open';
  if (op === 'open') return openCombat(partyState, action);
  if (op === 'attacker') return pickCombatAttacker(partyState, action);
  if (op === 'target') return pickCombatTarget(partyState, action);
  if (op === 'defense') return setDefense(partyState, action);
  if (op === 'replaceDefense') return replaceDefense(partyState, action);
  if (op === 'reveal') return revealCombat(partyState);
  if (op === 'value') return setCombatValue(partyState, action);
  if (op === 'cancelEffects') return cancelCombatEffects(partyState, action);
  if (op === 'choice') return openCombatChoice(partyState, action);
  if (op === 'pick') return pickCombatChoice(partyState, action);
  if (op === 'skip') return skipCombatChoice(partyState, action);
  if (op === 'resolve') return resolveCombat(partyState);
  if (op === 'close') return closeCombat(partyState);
  if (op === 'cancel') return cancelCombat(partyState, action);
  throw new Error(
    `SET_COMBAT: op "${op}" (нужны open | attacker | target | defense | replaceDefense | reveal | value | cancelEffects | choice | pick | skip | resolve | close | cancel)`,
  );
};

export default SET_COMBAT;
