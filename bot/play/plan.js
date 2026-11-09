import { runAction } from '#shared/publicApi.js';
import { actionsFor, actorOf } from './decide.js';
import { leafScore, myTurnOf, turnOver, worldFactory } from './search.js';

export { myTurnOf };

/**
 * Планировщик хода: решение — **последовательность своих действий до конца хода**, а не отдельное
 * действие. Поиск (`bot/play/search.js`) выбирает один ход и после него решает заново, поэтому связка
 * «встать на стихию и ударить», «зарядить катушку и потратить её в тот же ход», «сжечь духа и получить
 * действие» видна ему только через доигрывание. Здесь вариантами решения становятся сами цепочки: они
 * перебираются до конца хода, каждая доигрывается до конца хода плюс ответ соперника и сравнивается по
 * одной и той же оценке.
 *
 * Три части:
 *
 * 1. **Развёртка цепочек.** От текущего решения вперёд перебираются **мои** решения, пока идёт мой ход
 *    (`state.turn.playerId` — я; окна внутри хода, например защита соперника в моём бою, ход не
 *    заканчивают). Чужие решения (защита, ответы) не перебираются — это дело доигрывания: ученик не
 *    имеет права решать за соперника.
 * 2. **Оценка листа — конец хода.** Цепочка доигрывается детерминированной политикой до конца моего
 *    хода, затем (по умолчанию) до конца хода соперника, и только потом считается оценка позиции
 *    (`leafScore`). Иначе план выглядел бы выгодным ровно потому, что про ответ соперника забыли.
 * 3. **Общие миры.** Один и тот же детерминизированный мир (`worldFactory`) используется для **всех**
 *    цепочек, а доигрывание детерминированное — поэтому цепочки сравниваются на одинаковой случайности,
 *    и разница между ними не тонет в шуме (обычная беда сравнения по одному доигрыванию).
 *
 * Возвращается лучшая цепочка целиком: `plan` — что бот собирается сделать в этом ходу, `action` —
 * первый её шаг (его и играет партия). Игра по-прежнему отправляет по одному действию и пересчитывает
 * план после каждого шага, поэтому изменившийся мир (вскрытая карта, ответ соперника) план не ломает.
 */
const keyOf = action => JSON.stringify(action);

/** Переменные среды читаются через `typeof`: модуль попадает и в браузер (там `process` нет). */
const env = typeof process === 'undefined' ? {} : (process.env ?? {});

const envNumber = name => {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * Бюджет планировщика. Стоимость решения задаётся **числом шагов доигрывания** (`steps`) и делится
 * поровну между цепочками: без этого дерево цепочек растёт как `branch^myDepth × worlds`, и решение
 * становится в десятки раз дороже поиска одного действия (первый замер так и вышел — 20 секунд на
 * партию вместо двух).
 *
 * - `steps` — общий предел шагов доигрывания на одно решение; он же главный ограничитель стоимости;
 * - `worlds` — сколько детерминизированных миров усредняется (больше — устойчивее сравнение);
 * - `myDepth` — на сколько своих решений вперёд разворачиваются цепочки: два решения — это два действия
 *   хода, глубже имеет смысл только ради подшагов перемещения;
 * - `branch` — сколько лучших вариантов берётся на каждом своём решении (остальные отбрасываются по весу);
 * - `horizon` — предел шагов доигрывания **одной** цепочки (верхняя граница, её режет `steps`);
 * - `reply` — учитывать ли ответ соперника после конца моего хода (по умолчанию да);
 * - `policy` — политика, которой перечисляются **мои** варианты внутри цепочки (веса задают порядок);
 * - `rollout` — политика доигрывания (хвост хода и ответ соперника);
 * - `timeMs` — предел времени на решение (0 — без предела).
 */
export const planBudget = () => ({
  steps: envNumber('PLAN_STEPS') ?? 600,
  worlds: envNumber('PLAN_WORLDS') ?? 4,
  myDepth: envNumber('PLAN_DEPTH') ?? 2,
  branch: envNumber('PLAN_BRANCH') ?? 3,
  horizon: envNumber('PLAN_HORIZON') ?? 24,
  reply: env.PLAN_REPLY !== '0',
  policy: env.PLAN_POLICY ?? 'greedy',
  rollout: env.PLAN_ROLLOUT ?? 'aggressive',
  timeMs: envNumber('PLAN_TIME') ?? 0,
});

/**
 * Ход соперника кончился: активен снова я (или партия закончилась). Границы хода (`myTurnOf`,
 * `turnOver`) живут в `bot/play/search.js`: планировщик и поиск обязаны понимать ход одинаково.
 */
const backToMe = (state, viewerId) =>
  state.hook === 'gameEnd' || String(state.turn?.playerId) === String(viewerId);

/**
 * Доигрывание до выполнения условия на `steps` шагов. Политика доигрывания — та же, что у поиска
 * (агрессивная жадная): цепочки сравниваются между собой, а не с человеком, поэтому важна не
 * «правильность» доигрывания, а то, что все варианты доигрываются одинаково.
 */
const playUntil = (state, viewerId, budget, stop, steps) => {
  let current = state;

  for (let step = 0; step < steps; step += 1) {
    if (stop(current)) break;

    const actor = actorOf(current);
    if (actor == null) break;

    let options;
    try {
      options = actionsFor(current, actor, { policy: budget.rollout });
    } catch {
      break;
    }
    const offered = options.filter(entry => Number(entry.weight) > 0);
    const usable = offered.length > 0 ? offered : options;
    if (usable.length === 0) break;

    // детерминированно (argmax веса): случайность внутри доигрывания мешала бы сравнивать цепочки
    const best = usable.reduce((leader, entry) =>
      Number(entry.weight) > Number(leader.weight) ? entry : leader,
    );
    try {
      current = runAction(current, { ...best.action, playerId: actor });
    } catch {
      break;
    }
  }

  return current;
};

/**
 * Оценка позиции после моего хода и (если просили) ответа соперника. `steps` — сколько шагов
 * доигрывания разрешено этому листу: он делится между мной и ответом, чтобы цепочки сравнивались
 * на одинаковом объёме доигрывания.
 */
export const planValue = (state, viewerId, budget = planBudget(), steps = budget.horizon) => {
  const mine = Math.max(1, Math.ceil(steps / (budget.reply ? 2 : 1)));
  let current = playUntil(state, viewerId, budget, node => turnOver(node, viewerId), mine);
  if (budget.reply) {
    current = playUntil(current, viewerId, budget, node => backToMe(node, viewerId), mine);
  }
  return leafScore(current, viewerId);
};

/**
 * Развёртка моих цепочек от текущего состояния: список листьев, у каждого — свои шаги и состояние, из
 * которого считается оценка. Чужие решения и конец хода — тоже лист: дальше доигрывает `planValue`.
 */
const chainLeaves = (state, viewerId, budget) => {
  const started = Date.now();
  const leaves = [];

  const walk = (node, steps, depth) => {
    const leaf = () => leaves.push({ steps, state: node });

    if (leaves.length >= 256) return;
    if (budget.timeMs > 0 && Date.now() - started >= budget.timeMs) return;

    const actor = actorOf(node);
    if (actor == null || String(actor) !== String(viewerId) || turnOver(node, viewerId)) {
      leaf();
      return;
    }

    let options;
    try {
      options = actionsFor(node, actor, { policy: budget.policy });
    } catch {
      leaf();
      return;
    }
    const offered = options.filter(entry => Number(entry.weight) > 0);
    const usable = (offered.length > 0 ? offered : options)
      .slice()
      .sort((left, right) => Number(right.weight) - Number(left.weight))
      .slice(0, Math.max(1, budget.branch));

    if (usable.length === 0) {
      leaf();
      return;
    }

    let advanced = false;
    for (const entry of usable) {
      let next;
      try {
        next = runAction(node, { ...entry.action, playerId: actor });
      } catch {
        continue;
      }
      advanced = true;
      if (depth + 1 >= Math.max(1, budget.myDepth)) {
        leaves.push({ steps: [...steps, entry.action], state: next });
      } else {
        walk(next, [...steps, entry.action], depth + 1);
      }
    }

    // ни один вариант не сработал — состояние всё равно надо оценить, иначе план потеряет ветку
    if (!advanced) leaf();
  };

  walk(state, [], 0);
  return leaves;
};

/**
 * План на текущий ход: перебрать свои цепочки, оценить каждую в одних и тех же мирах и выбрать лучшую.
 *
 * Возвращает `null`, когда планировать нечего (не мой ход — решение принимает поиск) или когда
 * предлагать нечего. `rows` — по строке на первый шаг: средняя оценка цепочек с этим шагом, лучшая
 * цепочка и её ценность (по ним дневник и метрики видят, о чём бот думал).
 */
export const turnPlan = (state, viewerId, entries, budget = planBudget()) => {
  const candidates = (entries ?? []).filter(entry => entry?.action != null);
  if (candidates.length === 0) return null;
  if (!myTurnOf(state, viewerId)) return null;
  if (candidates.length === 1) {
    return { action: candidates[0].action, plan: [candidates[0].action], worlds: 0, rows: [] };
  }

  const started = Date.now();
  const makeWorld = worldFactory(state, viewerId);
  const rng = { value: (Number(state.rng?.value ?? 1) ^ 0x9e3779b9) >>> 0 };
  const byFirst = new Map();
  const worldCount = Math.max(1, budget.worlds);
  let worlds = 0;

  for (let index = 0; index < worldCount; index += 1) {
    if (budget.timeMs > 0 && Date.now() - started >= budget.timeMs) break;
    const world = makeWorld(rng);
    const leaves = chainLeaves(world, viewerId, budget).filter(
      leaf =>
        leaf.steps.length > 0 &&
        // снаружи (из настоящего состояния) предлагается свой список: чужие варианты в план не берём
        candidates.some(entry => keyOf(entry.action) === keyOf(leaf.steps[0])),
    );
    if (leaves.length === 0) continue;

    // стоимость решения ограничена сверху: шаги доигрывания делятся между цепочками поровну, поэтому
    // дерево цепочек не может сделать решение в десятки раз дороже поиска одного действия
    const perLeaf = Math.max(
      2,
      Math.floor(Math.max(1, budget.steps) / (leaves.length * worldCount)),
    );

    for (const leaf of leaves) {
      const value = planValue(leaf.state, viewerId, budget, Math.min(budget.horizon, perLeaf));
      const first = leaf.steps[0];
      const key = keyOf(first);
      const row = byFirst.get(key) ?? {
        key,
        action: first,
        sum: 0,
        count: 0,
        best: Number.NEGATIVE_INFINITY,
        plan: null,
      };
      row.sum += value;
      row.count += 1;
      if (value > row.best) {
        row.best = value;
        row.plan = leaf.steps;
      }
      byFirst.set(key, row);
    }
    worlds += 1;
  }

  const rows = [...byFirst.values()].map(row => ({
    key: row.key,
    action: row.action,
    visits: row.count,
    mean: row.sum / Math.max(1, row.count),
    value: row.best,
    plan: row.plan,
  }));
  if (rows.length === 0) return null;

  const best = rows.reduce((leader, row) => (row.mean > leader.mean ? row : leader));

  return {
    action: best.action,
    plan: best.plan ?? [best.action],
    value: best.mean,
    worlds,
    iterations: worlds,
    rows,
  };
};

export default turnPlan;
