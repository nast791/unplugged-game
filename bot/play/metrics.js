import { effectWorth } from './cards.js';
import { cardById, cardTypeById, deckCardIds } from './pool.js';

/**
 * Метрики партии и серии: урон, покрытие колоды, распределение действий, первое убийство.
 * Собираются по ходу прогона (`createMetrics` + `noteAction`/`noteTransition`) и сворачиваются
 * в таблицу по героям (`summarizeMetrics`) — из неё и строится отчёт бота.
 *
 * Первое убийство: партия считается решённой им, если победил тот, кто первым убил чужого бойца.
 * Приписка урона верна для дуэли (двое игроков): в FFA «нанесённый» урон зачли бы всем сразу.
 */
export const actionKinds = {
  attack: 'атака',
  defense: 'защита',
  effect: 'эффект',
  move: 'перемещение',
  target: 'выбор цели',
  option: 'свойство',
  draw: 'добор',
  confirm: 'завершение',
  placement: 'расстановка',
  unknown: 'неизвестно',
};

/** id карты без номера копии (`anubis_13_2` → `anubis_13`). */
export const cardIdOf = instanceId => String(instanceId ?? '').replace(/_\d+$/, '');

/** Вид действия по состоянию ДО хода: тип карты берём из контента, окно — из состояния. */
export const actionKindOf = (state, payload, types) => {
  if (state.hook === 'gameStart') return 'placement';
  if (payload.kind === 'card') {
    // гибрид считаем атакой: так же устроен подсчёт колод в `tests/support/deck-stats.mjs`
    const type = types.get(cardIdOf(payload.id));
    return type === 'attack' || type === 'hybrid' ? 'attack' : (type ?? 'unknown');
  }
  if (payload.kind === 'deck') return 'draw';
  if (payload.kind === 'option') return 'option';
  if (payload.kind === 'cell') return state.movement ? 'move' : 'target';
  if (payload.kind === 'fighter') return 'target';
  return 'confirm';
};

const normalizeKind = kind => (actionKinds[kind] ? kind : 'unknown');

/** Счётчик метрик одного прогона. Типы карт берутся из контента, но подменяются в тестах. */
export const createMetrics = (cardTypes = cardTypeById()) => ({
  cardTypes,
  actions: {}, // heroId → вид действия → сколько
  damage: {}, // heroId → { dealt, taken }
  played: {}, // heroId → Set id сыгранных карт
  turns: {}, // heroId → Map(ключ хода → сколько действий потрачено)
  firstBlood: null, // heroId, кто первым убил чужого бойца
  firstBloodStep: null,
  cards: {}, // heroId → id карты → { type, plays, empty, options, fires, value }
  skills: {}, // heroId → { opens, picks, fires }
  items: {}, // heroId → группа предмета → { active, changes, states }
  lastSkillKey: null, // разобранная отметка умения: срабатывание считается один раз
  lastPick: null, // окно, в котором сделан выбор: окно одной цели закрывается вместе с ним
});

/** Строка учёта карты: розыгрыши, добор, сброс без розыгрыша, выбранные свойства и «не сработало». */
const cardRow = (metrics, heroId, cardId) => {
  const cards = (metrics.cards[String(heroId)] ??= {});
  return (cards[cardId] ??= {
    type: metrics.cardTypes.get(cardId) ?? null,
    plays: 0,
    drawn: 0,
    discarded: 0,
    empty: 0,
    options: 0,
    fires: 0,
    value: 0,
    rules: [],
  });
};

/** Карта объявленного действия: до розыгрыша она в руке, а если уже ушла — определение из контента. */
const playedCardOf = (state, playerId, instanceId) => {
  const hand =
    (state.players ?? []).find(player => String(player.id) === String(playerId))?.hand?.cards ?? [];
  const found = hand.find(card => String(card.instanceId ?? card.id) === String(instanceId));
  return found ?? cardById(cardIdOf(instanceId));
};

/** Карта, чьё окно выбора открыто: у умения и фазы источник в картах не числится. */
const windowCardId = (state, metrics) => {
  const source = state.targeting?.source;
  if (source == null) return null;
  const cardId = cardIdOf(source);
  return metrics.cardTypes.has(cardId) ? cardId : null;
};

/** Учесть действие бота: распределение действий, покрытие карт и сработавшие свойства. */
export const noteAction = (metrics, state, payload) => {
  const heroId = String(payload.playerId);
  const kind = normalizeKind(actionKindOf(state, payload, metrics.cardTypes));
  const row = (metrics.actions[heroId] ??= {});
  row[kind] = (row[kind] ?? 0) + 1;

  if (payload.kind === 'card') {
    const cardId = cardIdOf(payload.id);
    (metrics.played[heroId] ??= new Set()).add(cardId);
    const card = cardRow(metrics, heroId, cardId);
    card.plays += 1;
    // сыгранная карта уходит из руки сама: в переходе её не считаем сброшенной без розыгрыша
    metrics.lastPlayed = { instanceId: String(payload.id) };
    const definition = playedCardOf(state, payload.playerId, payload.id);
    if (definition != null) {
      let worth = null;
      try {
        worth = effectWorth(definition, state, payload.playerId);
      } catch {
        worth = null; // у карты боя правила без цели не посчитать — карту это не ломает
      }
      if (worth != null) {
        for (const [index, fired] of (worth.ruleFires ?? []).entries()) {
          // момент `effect` — единственный, который видно при объявлении; боевые правила считает лента боя
          if (fired == null) continue;
          const rule = (card.rules[index] ??= { plays: 0, fires: 0 });
          rule.plays += 1;
          if (fired) rule.fires += 1;
        }
        // «впустую» — то же, что в `bot/tools/waste.js`: свойство эффекта не сработало ни разу
        if (card.type === 'effect') {
          card.fires += worth.fires;
          card.value += worth.value;
          if (worth.fires === 0) card.empty += 1;
        }
      }
    }
  }

  if (payload.kind === 'option') {
    const cardId = windowCardId(state, metrics);
    if (cardId != null) cardRow(metrics, heroId, cardId).options += 1;
  }

  // клик по кандидату окна: им окно одной цели и закрывается, отдельного закрытия в переходе нет
  if (state.targeting != null && ['fighter', 'cell', 'option'].includes(payload.kind)) {
    metrics.lastPick = windowKeyOf(state.targeting);
  }
};

const hpByPlayer = state =>
  Object.fromEntries(
    (state.players ?? []).map(player => [
      String(player.id),
      (player.fighters ?? []).reduce(
        (sum, fighter) => sum + Math.max(0, Number(fighter.currentHp) || 0),
        0,
      ),
    ]),
  );

const aliveByPlayer = state =>
  Object.fromEntries(
    (state.players ?? []).map(player => [
      String(player.id),
      (player.fighters ?? []).filter(fighter => Number(fighter.currentHp) > 0).length,
    ]),
  );

/** Ключ окна выбора: игрок и источник (карта, умение или фаза) — по нему видно, что окно сменилось. */
const windowKeyOf = targeting =>
  targeting == null ? null : `${String(targeting.playerId)}|${String(targeting.source ?? '')}`;

/** Отметки окна списком: у окна на несколько целей `picked` — массив. */
const pickedOf = targeting => {
  const picked = targeting?.picked ?? null;
  if (Array.isArray(picked)) return picked.map(String);
  return picked == null ? [] : [String(picked)];
};

const skillIdOf = (state, playerId) => {
  const player = (state.players ?? []).find(entry => String(entry.id) === String(playerId));
  return player?.skill?.id == null ? null : String(player.skill.id);
};

/** Окно открыто умением героя, а не картой или фазой. */
const isSkillWindow = (state, targeting) =>
  targeting?.source != null && String(targeting.source) === skillIdOf(state, targeting.playerId);

/** Ключ отметки умения: по нему видно, что умение сработало (или сменилось его срабатывание). */
const skillMarkOf = state => {
  const mark = state?.lastSkill;
  return mark == null
    ? null
    : `${String(mark.playerId)}|${String(mark.skillId)}|${String(mark.moment)}`;
};

/** Состояние предметов по копиям: копии одного предмета различаются номером (`coil_1`). */
const itemsByPlayer = state =>
  Object.fromEntries(
    (state.players ?? []).map(player => [
      String(player.id),
      Object.fromEntries(
        (player.items ?? []).map(item => [
          String(item.id),
          item.state == null ? null : String(item.state),
        ]),
      ),
    ]),
  );

/** Флаг постоянного умения по героям. */
const skillActiveByPlayer = state =>
  Object.fromEntries(
    (state.players ?? []).map(player => [String(player.id), player.skillActive === true]),
  );

/** Рука по копиям карт: добор виден по появлению копии, сброс без розыгрыша — по её исчезновению. */
const handsByPlayer = state =>
  Object.fromEntries(
    (state.players ?? []).map(player => [
      String(player.id),
      Object.fromEntries(
        (player.hand?.cards ?? []).map(card => [
          String(card.instanceId ?? card.id),
          // у карты в руке `id` — это id контента, а копию различает `instanceId`
          card.instanceId == null ? String(card.id) : cardIdOf(card.instanceId),
        ]),
      ),
    ]),
  );

/**
 * Числовой снимок здоровья ДО действия: `runAction` входное состояние не меняет
 * (`shared/helpers/fork.js`), но снять два числа дешевле, чем сравнивать состояния целиком, —
 * а разница нужна именно по здоровью и числу живых бойцов.
 */
export const snapshotHp = state => ({
  hp: hpByPlayer(state),
  alive: aliveByPlayer(state),
  // ключ хода и остаток действий: по ним считается, сколько действий потрачено в одном ходу
  turn:
    state.turn == null
      ? null
      : {
          playerId: state.turn.playerId,
          index: state.turn.index,
          actionsLeft: state.turn.actionsLeft,
        },
  // всё, что сравнивается в переходе: окно умения, отметка срабатывания и состояние предметов
  targeting:
    state.targeting == null
      ? null
      : {
          playerId: String(state.targeting.playerId),
          source: state.targeting.source == null ? null : String(state.targeting.source),
          picked: pickedOf(state.targeting),
          skill: isSkillWindow(state, state.targeting),
        },
  lastSkill: skillMarkOf(state),
  items: itemsByPlayer(state),
  skillActive: skillActiveByPlayer(state),
  hand: handsByPlayer(state),
});

/** Ключ хода: игрок и номер хода — по нему видно, сколько действий потрачено в одном ходу. */
const turnKeyOf = turn =>
  turn == null || turn.playerId == null ? null : `${String(turn.playerId)}:${String(turn.index)}`;

/**
 * Сколько действий потрачено в ходу. Часы движка — остаток действий (`turn.actionsLeft`): он
 * уменьшается за каждое действие, а ход, на котором остаток обнулился, заканчивается этим же действием
 * (активный игрок уже сменился) — поэтому действие засчитывается ходу **до** перехода.
 * Метрика нужна плану на ход (`bot/play/plan.js`): «стратегия на ход» — это ход, где действий больше
 * одного, и по доле таких ходов видно, играет ли бот связками или отдельными действиями.
 */
const noteTurn = (metrics, before, after) => {
  const was = before?.turn;
  const key = turnKeyOf(was);
  if (key == null) return;

  const now = after?.turn;
  const sameTurn = now != null && turnKeyOf(now) === key;
  const spent = sameTurn && Number(now.actionsLeft) >= Number(was.actionsLeft) ? 0 : 1;
  const turns = (metrics.turns[String(was.playerId)] ??= new Map());
  turns.set(key, (turns.get(key) ?? 0) + spent);
};

const skillRow = (metrics, heroId) =>
  (metrics.skills[String(heroId)] ??= { opens: 0, picks: 0, fires: 0 });

/**
 * Окно умения: открытия и закрытия выбором. Окно одной цели закрывается тем же кликом, поэтому
 * выбор виден только по действию (`metrics.lastPick`), а не по снимку.
 */
const noteSkillWindow = (metrics, before, after) => {
  const was = before.targeting;
  const now = after.targeting ?? null;
  const wasKey = windowKeyOf(was);
  const nowKey = windowKeyOf(now);

  if (now != null && nowKey !== wasKey && isSkillWindow(after, now)) {
    skillRow(metrics, now.playerId).opens += 1;
  }

  if (was?.skill !== true || pickedOf(was).length > 0) return;
  const sameWindow = wasKey === nowKey;
  if ((sameWindow && pickedOf(now).length > 0) || (!sameWindow && metrics.lastPick === wasKey)) {
    skillRow(metrics, was.playerId).picks += 1;
  }
};

/** Срабатывания умения: `lastSkill` сменился или включился флаг постоянного умения. */
const noteSkillFire = (metrics, before, after) => {
  const nowMark = skillMarkOf(after);
  const manual = before.targeting?.skill === true;
  const fired = new Set();

  for (const key of [before.lastSkill, nowMark]) {
    if (key == null || key === metrics.lastSkillKey) continue;
    // `picked` при открытом окне — это выбор игрока, а не срабатывание: оно уже посчитано кликом
    if (manual && key.endsWith('|picked')) continue;
    fired.add(key.split('|')[0]);
  }

  for (const [heroId, active] of Object.entries(skillActiveByPlayer(after))) {
    if (active && before.skillActive?.[heroId] !== true) fired.add(heroId);
  }

  for (const heroId of fired) skillRow(metrics, heroId).fires += 1;
  metrics.lastSkillKey = nowMark;
};

/** Состояния предметов: включился ли предмет хоть раз и какие состояния успел пройти. */
const noteItems = (metrics, before, after) => {
  for (const player of after.players ?? []) {
    const heroId = String(player.id);
    const was = before.items?.[heroId] ?? {};
    const row = (metrics.items[heroId] ??= {});

    for (const item of player.items ?? []) {
      const copyId = String(item.id);
      const group = String(item.group ?? item.id);
      const state = item.state == null ? null : String(item.state);
      const target = (row[group] ??= { active: false, changes: 0, states: new Set() });
      const previous = copyId in was ? was[copyId] : null;

      if (state != null) target.states.add(state);
      if (previous != null && state != null && previous !== state) target.changes += 1;
      if (state === 'active' || previous === 'active') target.active = true;
    }
  }
};

/**
 * Добор и сброс без розыгрыша: копия появилась в руке — карту добрали, исчезла и объявлена не была —
 * от неё избавились (усиление, лимит руки, свойство). Сыгранную карту сбросом не считаем.
 */
const noteHands = (metrics, before, after) => {
  for (const [heroId, was] of Object.entries(before ?? {})) {
    const now = after[heroId] ?? {};

    for (const [instanceId, cardId] of Object.entries(now)) {
      if (instanceId in was) continue;
      cardRow(metrics, heroId, cardId).drawn += 1;
    }

    for (const [instanceId, cardId] of Object.entries(was)) {
      if (instanceId in now) continue;
      if (metrics.lastPlayed?.instanceId === instanceId) continue;
      cardRow(metrics, heroId, cardId).discarded += 1;
    }
  }

  metrics.lastPlayed = null;
};

/** Учесть переход состояния: урон по бойцам (лечение игнорируется), первое убийство и счёт действий. */
export const noteTransition = (metrics, before, after, step) => {
  noteTurn(metrics, before, after);
  noteSkillWindow(metrics, before, after);
  noteSkillFire(metrics, before, after);
  noteItems(metrics, before, after);
  noteHands(metrics, before.hand, handsByPlayer(after));
  metrics.lastPick = null;

  const previous = before.hp;
  const current = hpByPlayer(after);
  const heroes = Object.keys(current);

  for (const heroId of heroes) {
    const lost = Math.max(0, (previous[heroId] ?? current[heroId]) - current[heroId]);
    if (!lost) continue;
    (metrics.damage[heroId] ??= { dealt: 0, taken: 0 }).taken += lost;
    for (const other of heroes) {
      if (other === heroId) continue;
      (metrics.damage[other] ??= { dealt: 0, taken: 0 }).dealt += lost;
    }
  }

  if (metrics.firstBlood != null) return;
  const wasAlive = before.alive;
  const nowAlive = aliveByPlayer(after);
  for (const heroId of heroes) {
    if (nowAlive[heroId] >= (wasAlive[heroId] ?? nowAlive[heroId])) continue;
    metrics.firstBlood = heroes.find(other => other !== heroId) ?? null;
    metrics.firstBloodStep = step;
    return;
  }
};

/** Сыгранные карты всей серии одним списком: по нему видно, что бот вообще не трогал. */
export const coverageOf = logs => {
  const cards = new Set();
  const options = new Set();

  for (const action of logs) {
    if (action.kind === 'card') cards.add(cardIdOf(action.id));
    if (action.kind === 'option') options.add(String(action.id));
  }

  return { cards: [...cards].sort(), options: [...options].sort() };
};

/**
 * Свод по серии: общие числа и строка на каждого героя. В средние идут только дошедшие до конца
 * партии — у упавшей партии метрики обрезаны, и она исказила бы урон и покрытие.
 * `cards`, `skills`, `items` — те же счётчики итогом по серии, в `heroes[heroId]` — по герою.
 */
export const summarizeMetrics = reports => {
  const totals = { games: 0, steps: 0, deaths: 0, decidedByFirstBlood: 0, turns: 0, fullTurns: 0 };
  const heroes = {};
  const cards = {};
  const skills = { opens: 0, picks: 0, fires: 0, applied: 0 };
  const items = { activeGames: 0, changes: 0 };
  const silentCards = [];
  const silentSkills = [];
  const silentItems = [];

  for (const report of reports) {
    if (report.status !== 'finished' || !report.metrics) continue;
    const metrics = report.metrics;
    const winner = String(report.state.winner);
    const heroIds = (report.state.players ?? []).map(player => String(player.id));

    totals.games += 1;
    totals.steps += report.steps;
    if (metrics.firstBlood != null) {
      totals.deaths += 1;
      if (metrics.firstBlood === winner) totals.decidedByFirstBlood += 1;
    }

    for (const heroId of heroIds) {
      const row = (heroes[heroId] ??= {
        games: 0,
        wins: 0,
        steps: 0,
        dealt: 0,
        taken: 0,
        actions: {},
        played: new Set(),
        deck: deckCardIds(heroId),
        turns: 0,
        fullTurns: 0,
        cards: {},
        skills: { opens: 0, picks: 0, fires: 0, applied: 0 },
        items: {},
      });

      row.games += 1;
      if (heroId === winner) row.wins += 1;
      row.steps += report.steps;
      const damage = metrics.damage[heroId] ?? { dealt: 0, taken: 0 };
      row.dealt += damage.dealt;
      row.taken += damage.taken;
      for (const [kind, count] of Object.entries(metrics.actions[heroId] ?? {})) {
        row.actions[kind] = (row.actions[kind] ?? 0) + count;
      }
      for (const cardId of metrics.played[heroId] ?? []) row.played.add(cardId);
      for (const spent of (metrics.turns?.[heroId] ?? new Map()).values()) {
        row.turns += 1;
        totals.turns += 1;
        if (spent >= 2) {
          row.fullTurns += 1;
          totals.fullTurns += 1;
        }
      }

      for (const [cardId, card] of Object.entries(metrics.cards?.[heroId] ?? {})) {
        const to = (row.cards[cardId] ??= {
          type: card.type,
          plays: 0,
          drawn: 0,
          discarded: 0,
          empty: 0,
          options: 0,
          fires: 0,
          value: 0,
          rules: [],
        });
        const all = (cards[cardId] ??= {
          type: card.type,
          plays: 0,
          drawn: 0,
          discarded: 0,
          empty: 0,
          options: 0,
          fires: 0,
          value: 0,
          rules: [],
        });
        for (const target of [to, all]) {
          target.plays += card.plays;
          target.drawn += card.drawn ?? 0;
          target.discarded += card.discarded ?? 0;
          target.empty += card.empty;
          target.options += card.options;
          target.fires += card.fires;
          target.value += card.value;
          for (const [index, rule] of (card.rules ?? []).entries()) {
            const merged = (target.rules[index] ??= { plays: 0, fires: 0 });
            merged.plays += rule.plays;
            merged.fires += rule.fires;
          }
        }
      }

      const skill = metrics.skills?.[heroId] ?? { opens: 0, picks: 0, fires: 0 };
      row.skills.opens += skill.opens ?? 0;
      row.skills.picks += skill.picks ?? 0;
      row.skills.fires += skill.fires ?? 0;
      skills.opens += skill.opens ?? 0;
      skills.picks += skill.picks ?? 0;
      skills.fires += skill.fires ?? 0;
      if ((skill.picks ?? 0) > 0 || (skill.fires ?? 0) > 0) {
        row.skills.applied += 1;
        skills.applied += 1;
      }

      for (const [group, item] of Object.entries(metrics.items?.[heroId] ?? {})) {
        const to = (row.items[group] ??= { activeGames: 0, changes: 0, states: new Set() });
        to.changes += item.changes;
        for (const state of item.states) to.states.add(state);
        if (item.active) to.activeGames += 1;
        items.changes += item.changes;
        if (item.active) items.activeGames += 1;
      }
    }
  }

  for (const [cardId, card] of Object.entries(cards)) {
    // «бесполезно» считается только там, где замерено: свойство эффекта ни разу не сработало
    if (card.type === 'effect' && card.plays > 0 && card.empty === card.plays) {
      silentCards.push(cardId);
    }
  }
  silentCards.sort((left, right) => cards[right].plays - cards[left].plays);

  for (const [heroId, row] of Object.entries(heroes)) {
    if (row.games > 0 && row.skills.picks === 0 && row.skills.fires === 0) {
      silentSkills.push(heroId);
    }
    for (const [group, item] of Object.entries(row.items)) {
      // «не включался» — только про предмет с состоянием «активна»: у осколков Снежной королевы
      // состояния свои (`ice`/`collected`), и «активна» у них не бывает никогда
      if (item.activeGames === 0 && item.states.has('active')) {
        silentItems.push(`${heroId}:${group}`);
      }
    }
  }

  silentItems.sort();

  // карты, которые добирались вхолостую и которые бот предпочитает сбрасывать, и молчащие механики
  const neverPlayed = [];
  const discardHeavy = [];
  const silentRules = [];
  for (const [heroId, row] of Object.entries(heroes)) {
    for (const [cardId, card] of Object.entries(row.cards)) {
      if (card.drawn > 0 && card.plays === 0)
        neverPlayed.push({ heroId, cardId, drawn: card.drawn });
      if (card.discarded >= 3 && card.discarded >= card.plays) {
        discardHeavy.push({ heroId, cardId, plays: card.plays, discarded: card.discarded });
      }
      for (const [index, rule] of (card.rules ?? []).entries()) {
        if (rule.plays >= 5 && rule.fires === 0) {
          silentRules.push({ heroId, cardId, index: Number(index), plays: rule.plays });
        }
      }
    }
  }
  neverPlayed.sort((left, right) => right.drawn - left.drawn);
  discardHeavy.sort((left, right) => right.discarded - left.discarded);
  silentRules.sort((left, right) => right.plays - left.plays);

  return {
    totals,
    heroes,
    cards,
    skills,
    items,
    silentCards,
    silentSkills,
    silentItems,
    neverPlayed,
    discardHeavy,
    silentRules,
  };
};

/** Доля в процентах: целое, без деления на ноль. */
export const percent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Распределение действий одной строкой: `атака 42%, перемещение 18%, …`. */
export const actionLine = actions => {
  const total = Object.values(actions).reduce((sum, count) => sum + count, 0);
  if (!total) return '—';
  return Object.entries(actions)
    .sort((left, right) => right[1] - left[1])
    .map(([kind, count]) => `${actionKinds[kind] ?? kind} ${percent(count, total)}%`)
    .join(', ');
};
