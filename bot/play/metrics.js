import { cardTypeById, deckCardIds } from './pool.js';

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
});

/** Учесть действие бота: распределение действий и покрытие сыгранных карт. */
export const noteAction = (metrics, state, payload) => {
  const heroId = String(payload.playerId);
  const kind = normalizeKind(actionKindOf(state, payload, metrics.cardTypes));
  const row = (metrics.actions[heroId] ??= {});
  row[kind] = (row[kind] ?? 0) + 1;

  if (payload.kind === 'card') {
    (metrics.played[heroId] ??= new Set()).add(cardIdOf(payload.id));
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

/** Учесть переход состояния: урон по бойцам (лечение игнорируется), первое убийство и счёт действий. */
export const noteTransition = (metrics, before, after, step) => {
  noteTurn(metrics, before, after);

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
 */
export const summarizeMetrics = reports => {
  const totals = { games: 0, steps: 0, deaths: 0, decidedByFirstBlood: 0, turns: 0, fullTurns: 0 };
  const heroes = {};

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
    }
  }

  return { totals, heroes };
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
