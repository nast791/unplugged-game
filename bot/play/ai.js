import { runUi } from '#shared/publicApi.js';
import { PROPOSER_POLICY, actionsFor, actorOf } from './decide.js';
import { searchAction, searchBudget } from './search.js';

export { pendingPlacementAi } from './decide.js';

/**
 * Ход бота — точка входа и для прогонов, и для браузера (режим `vs_ai`).
 *
 * Здесь нет ничего серверного и ничего node-специфичного: только состояние партии и id игрока. Поэтому
 * клиент зовёт этот же код, что и `bot/learn/train.js` с `bot/tools/matrix.js`, — сила игры в браузере та же, что в
 * замерах. Честность та же: список действий собирается по `runUi` (что движок показывает клиенту), свои
 * карты бот знает, чужие считает по остатку (`bot/play/counting.js`), чужая рука в поиске сэмплируется.
 *
 * CLI-обвязка для ручной пробы — `bot/tools/think.js`; прогон партий — `bot/play/duel.js`.
 */

/** Игроки под управлением компьютера: слоты `control: 'ai'` (режим `vs_ai`, `shared/constants/modes.js`). */
export const aiSeatIds = state =>
  (state?.players ?? [])
    .filter(player => String(player.control) === 'ai')
    .map(player => String(player.id));

/**
 * Предлагатель живого хода: та же политика, что перечисляет варианты в дневнике ученика
 * (`bot/learn/export.js`). Значение одно на рантайм и обучение — расхождение здесь означает, что
 * признак «мнение политики» в дневнике чужой (стережёт `tests/unit/bot/proposer.test.js`).
 */
export const RUNTIME_PROPOSER = PROPOSER_POLICY;

/** Играет ли этим игроком компьютер: в hotseat таких слотов нет вовсе. */
export const isAiSeat = (state, playerId) =>
  playerId != null && aiSeatIds(state).includes(String(playerId));

/**
 * Ход с бюджетом времени: перечисляем, что предлагает политика (её веса — приоритет выбора), и отдаём
 * решение поиску с лимитом `timeMs`. Если поиск не успел ни одного доигрывания, возвращаем `null`:
 * вызывающий играет обычной политикой, а не наугад.
 *
 * Перечисление идёт предлагателем рантайма (`PROPOSER_POLICY` в `bot/play/decide.js`, сейчас `trade`):
 * она читает условия **своих** карт («Погребальный звон» — 6, пока
 * Анубис не двигался) и оценивает темп по запасу колод, а лист поиска с §21 считает ресурс, помощников и
 * покой. Так игрок видит то, что меряется в прогонах, — иначе `vs_ai` оставался бы на признаках §15.
 *
 * `turn: false` (живое поведение с §51) — **лист по глубине**: роллаут идёт `depth` шагов и оценка
 * ставится по позиции (в прогонах это политика `search`). Так решил владелец по замеру §47/§51: при
 * **одинаковом бюджете времени** (тогда 200 мс, шесть героев, 2 400 партий, лестница в обе стороны)
 * обычный поиск не хуже «думать ход целиком» — 68% против 67% против живого ученика, а против `greedy`
 * 70% против 54%. Режим «думать ход целиком» остался переключателем (`turn: true`). **Бюджет поднят
 * до 400 мс решением владельца (§54):** при 200 мс поиск не сходится (ответ при 24 мирах совпадает с
 * ответом при 96 в 71%), а на 400 мс тот же поиск берёт против `greedy` **76% против 24%** вместо 70%.
 * Что работает в обоих режимах: жёсткий **лимит времени** на решение — `timeMs` режется и между
 * роллаутами, и внутри каждого из них (`bot/play/search.js: rolloutEnd`), так что ход не затягивается.
 * Вне своего хода (защита в чужом бою) поиск сам снимает `turnEnd`: границы моего хода там нет, и лист
 * выродился бы в оценку позиции.
 */
export const think = (state, playerId, { timeMs = 1000, overrides = {}, turn = false } = {}) => {
  const options = actionsFor(state, playerId, { policy: PROPOSER_POLICY });
  const offered = options.filter(entry => entry.weight > 0);
  const candidates = (offered.length > 0 ? offered : options).map(entry => ({
    action: entry.action,
    weight: entry.weight,
  }));

  const budget = { ...searchBudget() };
  const started = Date.now();
  const decision = searchAction(state, playerId, candidates, {
    ...budget,
    // бюджет времени главный: доигрываний просим заведомо больше, чем успеем, иначе лимит итераций
    // сработает раньше времени (32 доигрывания — это ~50 мс, а не секунда)
    iterations: overrides.iterations ?? (timeMs > 0 ? 100000 : undefined),
    timeMs,
    // лист на границе хода: своя цепочка действий до конца хода плюс ответ соперника
    ...(turn ? { turnEnd: true, replyTurn: true, depth: Math.max(budget.depth, 24) } : {}),
    ...overrides,
  });

  return {
    action: decision?.action ?? null,
    iterations: decision?.iterations ?? 0,
    // сколько доигрываний срезал предел времени: по этому числу видно, держал ли бюджет ход
    timedOut: decision?.timedOut ?? 0,
    elapsedMs: Date.now() - started,
    phase: runUi(state, playerId).phase ?? null,
  };
};

/**
 * Один шаг за компьютер: кто сейчас действует, если это слот `ai`, — его ход. `null` значит «дальше
 * решает человек» (или партия кончилась) — по этому признаку клиент останавливает свой цикл.
 *
 * Если компьютер действует, но поиск не нашёл ни одного действия (`action: null`), шаг всё равно
 * возвращается: это не «ход человека», а тупик, о котором клиенту нужно сказать вслух.
 */
export const aiStep = (state, { timeMs = 250, overrides = {} } = {}) => {
  if (state == null || state.hook === 'gameEnd') return null;

  const playerId = actorOf(state);
  if (playerId == null || !isAiSeat(state, playerId)) return null;

  return { playerId: String(playerId), ...think(state, playerId, { timeMs, overrides }) };
};
