import { SET_COMBAT } from '#shared/actions/combat.js';
import { combatMomentsAt } from '#shared/constants/moments.js';
import { cardKey } from '#shared/helpers/cards.js';
import { closeTargetingWindow, pickSingleCandidate } from '#shared/helpers/targeting.js';
import { ruleMatches, runRules } from '#shared/rules/run.js';

/** Запас шагов: эффектов в бою мало, но защищаемся от зацикливания. */
const MAX_COMBAT_STEPS = 64;

const cardOf = (combat, side) => (side === 'defender' ? combat.defenseCard : combat.attackCard);

/**
 * Правило, за которое отвечает шаг: шагов столько же, сколько правил карты в этом моменте,
 * и идут они в том же порядке — индекс шага среди шагов той же стороны и момента даёт правило.
 */
const ruleOfStep = (combat, step) => {
  const rules = (cardOf(combat, step.side)?.rules ?? []).filter(
    rule => rule.moment === step.moment,
  );
  const index = (combat.effects ?? [])
    .filter(entry => entry.side === step.side && entry.moment === step.moment)
    .findIndex(entry => entry === step);

  return index < 0 ? null : (rules[index] ?? null);
};

/**
 * Один шаг очереди: одно правило карты в его моменте.
 * Если эффекты этой стороны отменены картой противника («мгновенно»), шаг помечается `cancelled`
 * и не разыгрывается. Если правило открыло выбор игрока (окно вариантов, цели или черновик
 * перемещения), шаг остаётся в ожидании (`waiting`) — бой на паузе, дальше очередь не идёт.
 */
const runEffectStep = (partyState, step) => {
  const combat = partyState.combat;

  if (combat.cancelled?.[step.side] === true) {
    step.status = 'cancelled';
    return partyState;
  }

  const rule = ruleOfStep(combat, step);
  if (!rule || !ruleMatches(partyState, rule, { playerId: step.playerId })) {
    step.status = 'skipped';
    return partyState;
  }

  const state = runRules(partyState, [rule], step.moment, {
    playerId: step.playerId,
    source: step.cardId,
    card: cardOf(combat, step.side),
    autoPick: autoPickFor(cardOf(combat, step.side)),
  });

  step.status = waitingForPlayer(state) ? 'waiting' : 'applied';
  return state;
};

/** Ждёт ли партия решения игрока: открыта пауза выбора эффекта, окно выбора или черновик перемещения. */
const waitingForPlayer = partyState =>
  Boolean(partyState.combat?.choice || partyState.targeting || partyState.movement);

/**
 * Окно с одним кандидатом карта закрывает сама: отмечаем цель и разыгрываем её момент `picked`.
 * Так свойство карты, у которого нет выбора, не спрашивает игрока о клике.
 */
const autoPickFor = card => (state, ownerId) => {
  const picked = pickSingleCandidate(state, ownerId);
  if (!picked) return state;

  const afterPicked = runRules(picked, card?.rules ?? [], 'picked', {
    playerId: ownerId,
    source: cardKey(card),
    card,
  });
  return closeTargetingWindow(afterPicked, ownerId);
};

/**
 * Шаг очереди, который сейчас ждёт ответа игрока.
 *
 * Отвечать нужно **тому** шагу, чьё окно открыто: пауз в одном бою может быть несколько (своя карта
 * и чужая), и «первый ждущий» — не обязательно тот, кого спрашивают. Ответ уходил чужой карте, и её
 * правило в моменте `picked` пыталось, например, поменять число боя уже после расчёта —
 * `SET_COMBAT: шаг "reveal" недоступен на stage "close"`. Окно хранит ключ открывшей его карты
 * (`source`), у шага тот же ключ лежит в `cardId`.
 */
const waitingStep = partyState => {
  const waiting = (partyState.combat?.effects ?? []).filter(entry => entry.status === 'waiting');
  if (waiting.length === 0) return null;

  const source = partyState.targeting?.source ?? partyState.combat?.choice?.source ?? null;
  if (source == null) return waiting[0];
  return waiting.find(entry => String(entry.cardId) === String(source)) ?? waiting[0];
};

/** Карта боя, чей шаг сейчас ждёт решения игрока (её правила разбирают отметку варианта). */
export const waitingCombatCard = partyState => {
  const step = waitingStep(partyState);
  if (!step) return null;
  return cardOf(partyState.combat, step.side) ?? null;
};

/** Игрок отказался от необязательного свойства: шаг, ждавший решения, помечается `declined`. */
export const declineWaitingStep = partyState => {
  const step = waitingStep(partyState);
  if (step) step.status = 'declined';
  return partyState;
};

/**
 * Доиграть карту, чей шаг ждал отметки игрока (момент `picked`): например, выбран вариант эффекта.
 * Шаг помечается сработавшим — или остаётся в ожидании, если правило `picked` открыло свою паузу
 * (перемещение от эффекта), — и дальше очередь боя продолжается как обычно.
 */
export const runCombatPicked = partyState => {
  const combat = partyState.combat;
  const step = waitingStep(partyState);
  if (!step) return partyState;

  const card = cardOf(combat, step.side);
  const state = runRules(partyState, card?.rules ?? [], 'picked', {
    playerId: step.playerId,
    source: step.cardId,
    card,
  });

  step.status = waitingForPlayer(state) ? 'waiting' : 'applied';
  return state;
};

/**
 * Открыть слот разыгранной эффектной карты. Карта открыта всем (как карта атаки в бою),
 * а её правила становятся очередью шагов: по шагу на правило, в порядке текста карты.
 * Статусы те же, что у эффектов боя: pending → waiting (ждём решения) → applied | skipped.
 */
export const openEffect = (partyState, { playerId, card } = {}) => {
  partyState.effect = {
    playerId: String(playerId),
    source: cardKey(card),
    card,
    picked: [],
    steps: (card?.rules ?? []).map((rule, index) => ({
      order: index + 1,
      moment: rule.moment,
      title: rule.title ?? null,
      status: 'pending',
    })),
  };
  return partyState;
};

/**
 * Прогон правил разыгранной эффектной карты в моменте — шаг за шагом, как очередь эффектов боя.
 * Правило, чьи условия не сошлись, помечается `skipped`; правило, открывшее выбор игрока, — `waiting`,
 * и дальше очередь не идёт, пока игрок не ответит. Слот живёт до конца эффекта.
 */
export const runEffectMoment = (partyState, moment) => {
  const effect = partyState.effect;
  if (!effect?.card) return partyState;

  let state = partyState;
  // шаг, который ждал решения игрока, доигран: выбор сделан, эффект сработал
  for (const step of state.effect.steps ?? []) {
    if (step.status === 'waiting') step.status = 'applied';
  }

  const rules = effect.card.rules ?? [];

  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    const step = state.effect?.steps?.[index];
    if (!step || step.status !== 'pending' || rule.moment !== moment) continue;

    if (!ruleMatches(state, rule, { playerId: state.effect.playerId })) {
      step.status = 'skipped';
      continue;
    }

    state = runRules(state, [rule], moment, {
      playerId: state.effect.playerId,
      source: cardKey(state.effect.card),
      card: state.effect.card,
      autoPick: autoPickFor(state.effect.card),
    });

    step.status = state.targeting || state.movement ? 'waiting' : 'applied';
    if (step.status === 'waiting') break;
  }

  return state;
};

/**
 * Доиграть бой до выбора эффекта игрока или до конца.
 *
 * Шаги берём из очереди `combat.effects` (её строит SET_COMBAT на вскрытии): до расчёта чисел идут
 * «немедленно» и «во время боя», после расчёта — «после боя». Момент шага решает, на какой стадии боя
 * он разыгрывается, поэтому эффект «после боя» видит уже готовый итог боя (факт COMBAT).
 * Эффекты, которые ждут решения игрока, остаются со статусом waiting — их доигрывает тот, кто ответил
 * (`SET_COMBAT boost` или `skip`), а этот проход снова вызывается после ответа.
 */
export const advanceCombat = partyState => {
  let state = partyState;

  for (let step = 0; step < MAX_COMBAT_STEPS; step += 1) {
    const combat = state.combat;
    // пауза: выбор эффекта, окно выбора (вариант, цель, клетка) или черновик перемещения
    if (!combat || waitingForPlayer(state)) return state;
    // замена защиты («Амат разрывает»): бой вернулся на шаг выбора защиты — ждём клика защитника,
    // очередь продолжится после него
    if (combat.stage === 'defense') return state;

    const stageMoments = combatMomentsAt(combat.stage);
    const pending = (combat.effects ?? []).find(
      entry => entry.status === 'pending' && stageMoments.includes(entry.moment),
    );
    if (pending) {
      state = runEffectStep(state, pending);
      continue;
    }

    if (combat.stage === 'reveal') {
      state = SET_COMBAT(state, { op: 'reveal' });
      continue;
    }
    if (combat.stage === 'resolve') {
      state = SET_COMBAT(state, { op: 'resolve' });
      continue;
    }

    return SET_COMBAT(state, { op: 'close' });
  }

  throw new Error(`cards: бой не завершился за ${MAX_COMBAT_STEPS} шагов`);
};

export default advanceCombat;
