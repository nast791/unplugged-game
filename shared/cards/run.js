import { SET_COMBAT } from '#shared/actions/combat.js';
import { actions } from '#shared/actions/index.js';
import { combatMomentsAt } from '#shared/constants/moments.js';
import { runConditions } from '#shared/facts/run.js';
import { zoneCards } from '#shared/helpers/base.js';
import { cardKey, cardOptionText } from '#shared/helpers/cards.js';
import { damagedSince, healedSince, healthSnapshot, hurtSince } from '#shared/helpers/damage.js';
import { forkState } from '#shared/helpers/fork.js';
import {
  closeTargetingWindow,
  pickAutoCandidates,
  windowPicked,
} from '#shared/helpers/targeting.js';
import { hasMissing, resolveVars } from '#shared/helpers/vars.js';
import { ruleMatches, runRules } from '#shared/rules/run.js';

/** Запас шагов: эффектов в бою мало, но защищаемся от зацикливания. */
const MAX_COMBAT_STEPS = 64;

const isTargetingStep = step => ['cells', 'fighters', 'options'].includes(step?.kind);

/**
 * Изменит ли розыгрыш карты хоть что-нибудь: состояние на форке сравнивается со входным. Эффект
 * «ничего не произошло» — это ветка, которая не сошлась или собрала пустое окно (`SET_TARGETING` без
 * кандидатов), либо действие, которое не нашло цели. Негатив считается: добор из пустой колоды
 * отнимает здоровье, и карта остаётся играбельной.
 *
 * Сравниваем значения, а не ссылки: движок правит вложенные объекты на месте, а на форке появляются
 * новые обёртки, поэтому ссылки разошлись бы и без правок.
 */
export const effectBrings = (partyState, playerId, card) => {
  // окно выбора или черновик перемещения уже открыт: в этот момент эффект не предлагается вовсе
  if (partyState?.targeting || partyState?.movement) return false;

  // Копируем только то, что движок вообще правит (`forkState`), и сравниваем эти ветки: `JSON.stringify`
  // всего состояния тянул бы за собой карты и поле, которых правки не касаются.
  const before = JSON.stringify(forkState(partyState));
  const draft = forkState(partyState);
  const owner = String(playerId);
  const source = cardKey(card);

  for (const rule of card?.rules ?? []) {
    if (rule.moment !== 'effect') continue;
    const matched = runConditions(draft, rule, { playerId });
    if (!matched.ok) continue;

    for (const step of rule.then ?? []) {
      const { action: actionName, ...params } = step;
      const action = actions[actionName];
      if (typeof action !== 'function') {
        throw new Error(`rules: действие "${actionName}" не найдено`);
      }

      const resolved = resolveVars(params, matched.vars, { remembered: draft._remember });
      if (hasMissing(resolved)) continue;
      // окно, которое нечем собрать, розыгрыш не открывает — свойства тут просто нет
      if (isTargetingStep(resolved) && resolved.candidates?.length === 0) continue;
      if (draft.targeting && isTargetingStep(resolved)) continue;

      action(draft, { ...resolved, playerId: owner, source, playedCard: card });
    }

    if (JSON.stringify(forkState(draft)) !== before) return true;
  }

  return false;
};

const cardOf = (combat, side) => (side === 'defender' ? combat.defenseCard : combat.attackCard);

/** Отпечаток правимых движком ветвей: по нему видно, изменил ли шаг хоть что-нибудь. */
const fingerprint = partyState => JSON.stringify(forkState(partyState));

/**
 * Итог шага: правило, которое ничего не изменило, — «не сработало». Так свойство, чьё действие
 * не нашло цели (пустое перемещение, некому нанести урон), не выдаёт себя за сработавшее.
 */
const stepStatus = (state, before) => {
  if (waitingForPlayer(state)) return 'waiting';
  return fingerprint(state) === before ? 'skipped' : 'applied';
};

/**
 * Правило, за которое отвечает шаг: шагов столько же, сколько правил карты в этом моменте,
 * и идут они в том же порядке — индекс шага среди шагов той же стороны и момента даёт правило.
 */
/** Правила, за которые отвечает шаг: ветки одного свойства (`step.rules`) или одно правило по порядку. */
const rulesOfStep = (combat, step) => {
  const rules = (cardOf(combat, step.side)?.rules ?? []).filter(
    rule => rule.moment === step.moment,
  );

  if (Array.isArray(step.rules) && step.rules.length > 0) {
    return step.rules.map(index => rules[index]).filter(Boolean);
  }

  const index = (combat.effects ?? [])
    .filter(entry => entry.side === step.side && entry.moment === step.moment)
    .findIndex(entry => entry === step);

  return index < 0 ? [] : [rules[index]].filter(Boolean);
};

/**
 * Индексы правил шага в полном списке `card.rules`: по ним видно, какое правило открыло паузу.
 * `step.rules` — ветки одного свойства, они считаются по правилам своего момента.
 */
const ruleIndexesOf = (combat, step) => {
  const rules = cardOf(combat, step.side)?.rules ?? [];
  const indexes = rules
    .map((rule, index) => (rule.moment === step.moment ? index : -1))
    .filter(index => index >= 0);

  if (Array.isArray(step.rules) && step.rules.length > 0) {
    return step.rules.map(index => indexes[index]).filter(index => index != null);
  }

  const ordinal = (combat.effects ?? [])
    .filter(entry => entry.side === step.side && entry.moment === step.moment)
    .findIndex(entry => entry === step);

  return ordinal < 0 ? [] : [indexes[ordinal]].filter(index => index != null);
};

/**
 * Правила `picked`, которые доигрывают именно этот шаг: они идут подряд сразу после правила,
 * открывшего окно. Свои `picked` есть у разных свойств одной карты («Зеркальный скол»: сброс чужой
 * карты и перенос бойца), и прогон всех `picked` подряд отправлял выбор карты в чужое правило.
 */
const pickedRulesOf = (card, indexes = []) => {
  const rules = card?.rules ?? [];
  if (indexes.length === 0) return [];

  // у сгруппированного свойства открывателей несколько (весы: помилование и наказание), поэтому
  // `picked` ищем после КАЖДОГО из них: иначе свойство одного открывателя не доигрывалось бы
  const out = [];
  const seen = new Set();
  for (const from of [...indexes].sort((left, right) => left - right)) {
    for (let index = from + 1; index < rules.length; index += 1) {
      if (rules[index].moment !== 'picked') break;
      if (seen.has(index)) continue;
      seen.add(index);
      out.push(rules[index]);
    }
  }
  return out;
};

/** Правила `picked`, которые доигрывает шаг. Если открывателя в очереди нет (шаг-пауза без своего
 * правила), берём все `picked` карты — иначе ответ игрока никуда не уходил бы. */
const pickedRulesForStep = (combat, step, card) => {
  const indexes = ruleIndexesOf(combat, step);
  if (indexes.length === 0) return (card?.rules ?? []).filter(rule => rule.moment === 'picked');
  return pickedRulesOf(card, indexes);
};

/** Сколько каких карт лежит в сбросах: по нему видно, что именно ушло в сброс за шаг свойства. */
const discardSnapshot = partyState => {
  const snapshot = new Map();
  for (const player of partyState?.players ?? []) {
    const counts = new Map();
    for (const card of zoneCards(player.discard)) {
      const key = cardKey(card);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    snapshot.set(String(player.id), counts);
  }
  return snapshot;
};

const discardedSince = (partyState, snapshot) => {
  const list = [];
  for (const player of partyState?.players ?? []) {
    const counts = new Map(snapshot.get(String(player.id)) ?? []);
    for (const card of zoneCards(player.discard)) {
      const key = cardKey(card);
      const left = counts.get(key) ?? 0;
      if (left > 0) {
        counts.set(key, left - 1);
        continue;
      }
      list.push({
        playerId: String(player.id),
        key,
        title: String(card.title ?? ''),
        // снимок карты: окно битвы показывает у сброшенной карты тип, число и подсказку с текстом
        type: card.type ?? null,
        value: Number(card.value) || 0,
        bonus: Number(card.bonus) || 0,
        text: String(card.text ?? ''),
        // варианты свойства — такая же часть текста карты, как и `text`: без них подсказка
        // у сброшенной карты обрывается на «Выберите одно свойство:»
        options: (card.options ?? []).map(entry => ({ ...entry })),
      });
    }
  }
  return list;
};

/** Запись шага для окна битвы: кого ранило, кого подлечило и какая карта ушла в сброс — «Результат» по факту. */
const noteStepChanges = (step, state, health, discarded) => {
  const hurt = hurtSince(state, health);
  if (hurt.length > 0) step.hurt = [...(step.hurt ?? []), ...hurt];

  const healed = healedSince(state, health);
  if (healed.length > 0) step.heal = [...(step.heal ?? []), ...healed];

  const dropped = discardedSince(state, discarded);
  if (dropped.length > 0) step.discarded = [...(step.discarded ?? []), ...dropped];
};

/** Раскрытия, которые появились за шаг: их пишем в шаг, чтобы окно битвы показало карту результатом. */
const noteReveals = (step, state, before) => {
  const added = (state.reveal ?? []).filter(entry => !(before ?? []).includes(entry));
  if (added.length === 0) return;

  const shown = added.map(entry => ({
    playerId: String(entry.playerId),
    cards: (entry.cards ?? []).map(card => ({ ...card })),
  }));
  step.reveal = [...(step.reveal ?? []), ...shown];
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

  const stepRules = rulesOfStep(combat, step);
  const matchedRules = stepRules.filter(rule =>
    ruleMatches(partyState, rule, { playerId: step.playerId }),
  );
  if (matchedRules.length === 0) {
    step.status = 'skipped';
    // свойство не сработало — в строке остаётся его текст, иначе «не сработало» осталось бы без
    // объяснения; у свойства с ветками это общий текст, потому что ни одна ветка не сошлась
    step.text = stepRules[0]?.text ?? step.text ?? null;
    return partyState;
  }

  const before = fingerprint(partyState);
  const health = healthSnapshot(partyState);
  const discarded = discardSnapshot(partyState);
  const revealBefore = partyState.reveal ?? null;
  const stepCard = cardOf(combat, step.side);
  const state = runRules(partyState, matchedRules, step.moment, {
    playerId: step.playerId,
    source: step.cardId,
    card: stepCard,
    autoPick: autoPickFor(stepCard, pickedRulesForStep(combat, step, stepCard)),
  });

  // в строке — текст этого свойства: у ветки своя фраза, у одиночного свойства своя
  step.text = matchedRules[0].text ?? step.text ?? null;

  step.status = stepStatus(state, before);
  // урон шага: в окне битвы урон карт и урон свойств — разные слагаемые, и свойство показывает своё
  const damage = damagedSince(state, health);
  if (damage > 0) step.damage = damage;
  noteStepChanges(step, state, health, discarded);
  noteReveals(step, state, revealBefore);
  return state;
};

/** Ждёт ли партия решения игрока: открыта пауза выбора эффекта, окно выбора или черновик перемещения. */
const waitingForPlayer = partyState =>
  Boolean(partyState.combat?.choice || partyState.targeting || partyState.movement);

/**
 * Окно без выбора карта закрывает сама: отмечаем кандидатов и разыгрываем момент `picked`.
 * Так свойство карты, у которого нет выбора, не спрашивает игрока о клике. Доигрываются только
 * правила `picked` этого свойства: у карты их бывает несколько, и чужое правило ждёт чужой отметки.
 */
const autoPickFor =
  (card, pickedRules = []) =>
  (state, ownerId) => {
    const picked = pickAutoCandidates(state, ownerId);
    if (!picked) return state;

    const afterPicked = runRules(picked, pickedRules, 'picked', {
      playerId: ownerId,
      source: cardKey(card),
      card,
    });
    return closeTargetingWindow(afterPicked, ownerId);
  };

/** Подписи отмеченного в окне выбора: «Результат» показывает то, что игрок выбрал, а не номер правила. */
const pickedLabelsOf = (window, card = null) => {
  const ids = windowPicked(window).map(String);
  if (ids.length === 0) return [];

  const candidates = window?.candidates ?? [];
  return ids
    .map(id => {
      const entry = candidates.find(item =>
        [item.optionId, item.fighterId, item.cellId, item.id].some(
          value => value != null && String(value) === id,
        ),
      );
      return String(entry?.title ?? entry?.name ?? cardOptionText(card, id) ?? '').trim();
    })
    .filter(Boolean);
};

/**
 * Снимок отмеченных карт: строки результата печатают вид карты (название, текст, тип, значение,
 * бонус), а не её ключ. Кандидаты окна руки уже несут полный вид карты (`zone`, `title`, `text`).
 */
const pickedCardsOf = window => {
  const ids = windowPicked(window).map(String);
  if (ids.length === 0) return [];

  const candidates = window?.candidates ?? [];
  return ids
    .map(id =>
      candidates.find(
        entry =>
          entry?.zone != null &&
          [entry.optionId, entry.cardId, entry.id].some(
            value => value != null && String(value) === id,
          ),
      ),
    )
    .filter(Boolean)
    .map(entry => ({ ...entry }));
};

/** Шаг очереди, чьё окно открыло выбор карты: шаг помним номером, у одной карты пауз бывает несколько. */
const stepOfCard = (combat, pending) => {
  const list = combat?.effects ?? [];
  if (pending?.order != null) {
    const byOrder = list.find(
      entry =>
        Number(entry.order) === Number(pending.order) &&
        String(entry.cardId) === String(pending.cardId),
    );
    if (byOrder) return byOrder;
  }

  const sameCard = list.filter(entry => String(entry.cardId) === String(pending?.cardId));
  return sameCard[sameCard.length - 1] ?? null;
};

/**
 * Доиграть карту после выбора карты в паузе эффекта (`SET_COMBAT pick`): выбор закрывает само действие,
 * окна выбора к этому моменту уже нет, поэтому правила `picked` разыгрываются здесь — выбранные карты
 * видит факт `PICKED` (служебный `_picked` живёт только на время прогона, как `_death`).
 */
const runChoicePicked = partyState => {
  const combat = partyState.combat;
  const pending = combat?.choicePicked;
  if (!pending) return partyState;

  combat.choicePicked = null;
  const step = stepOfCard(combat, pending);
  if (!step) return partyState;

  const card = cardOf(combat, step.side);
  const health = healthSnapshot(partyState);
  const discarded = discardSnapshot(partyState);

  partyState._picked = [...(pending.cards ?? [])];
  try {
    const state = runRules(partyState, pickedRulesForStep(combat, step, card), 'picked', {
      playerId: step.playerId,
      source: step.cardId,
      card,
    });

    step.status = waitingForPlayer(state) ? 'waiting' : 'applied';
    const damage = damagedSince(state, health);
    if (damage > 0) step.damage = (Number(step.damage) || 0) + damage;
    noteStepChanges(step, state, health, discarded);
    return state;
  } finally {
    delete partyState._picked;
  }
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
  const health = healthSnapshot(partyState);
  const discarded = discardSnapshot(partyState);
  const revealBefore = partyState.reveal ?? null;
  // окно, открытое шагом: его отметка — это и есть «Результат» свойства
  const answered = partyState.targeting ?? null;
  const labels = pickedLabelsOf(answered, card);
  const state = runRules(partyState, pickedRulesForStep(combat, step, card), 'picked', {
    playerId: step.playerId,
    source: step.cardId,
    card,
  });

  if (labels.length > 0) step.picked = [...(step.picked ?? []), ...labels];
  const pickedCards = pickedCardsOf(answered);
  if (pickedCards.length > 0) step.pickedCards = [...(step.pickedCards ?? []), ...pickedCards];

  // выбор сделан — отметка больше не ждёт игрока: окно закрываем до проверки паузы, иначе шаг
  // навсегда останется «пауза: решает игрок» (окно `picked` уже не нужно, а пауза держит бой)
  const settled = state.targeting === answered ? closeTargetingWindow(state, step.playerId) : state;
  step.status = waitingForPlayer(settled) ? 'waiting' : 'applied';
  // шаг ждал решения игрока: урон свойства считается здесь, когда выбор сделан
  const damage = damagedSince(settled, health);
  if (damage > 0) step.damage = (Number(step.damage) || 0) + damage;
  noteStepChanges(step, settled, health, discarded);
  noteReveals(step, settled, revealBefore);
  return settled;
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

    const before = fingerprint(state);

    state = runRules(state, [rule], moment, {
      playerId: state.effect.playerId,
      source: cardKey(state.effect.card),
      card: state.effect.card,
      autoPick: autoPickFor(state.effect.card, pickedRulesOf(state.effect.card, [index])),
    });

    step.status = stepStatus(state, before);
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
    // выбор карты в паузе закрыт действием: доигрываем правило `picked` его карты, иначе свойство,
    // которое обещало сработать после выбора, молчит («Хрустальный барьер» не поднимал защиту до 4)
    if (combat?.choicePicked) {
      state = runChoicePicked(state);
      continue;
    }
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
