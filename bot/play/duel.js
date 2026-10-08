import { runAction, runUi } from '#shared/publicApi.js';
import { createGame } from '../../server/create.js';
import { load } from '../../server/party.js';
import { actionsFor, actorOf, pickWeighted } from './decide.js';
import { createMetrics, noteAction, noteTransition, snapshotHp } from './metrics.js';

/**
 * Прогон партии ботом: играет сам, используя только то, что движок показывает клиенту (`runUi`), —
 * то есть заодно проверяет и контракт интерфейса. Ищет:
 * - `crash` — `runAction` упал;
 * - `deadlock` — партия не закончена, но легальных действий нет (игрок упёрся в пустой экран);
 * - `noop` — действие прошло, но состояние не изменилось (кнопка «ничего не делает»);
 * - `invalid` — нарушен инвариант (боец на чужой клетке, двое на клетке, здоровье выше начального);
 * - `stuck` — партия не завершилась за отведённые шаги.
 *
 * Рандом бота отдельный от игрового (`state.rng`), поэтому прогон воспроизводим по `seed`.
 * Пара героев — любая из контента (`heroA` и `heroB`), чётные сиды первым отдают ход `heroB`:
 * так порядок хода проверяется на обеих сторонах.
 *
 * Сам выбор хода живёт в `bot/play/decide.js` (он же работает в браузере), здесь — сборка партии и её прогон:
 * эти части требуют серверного реестра (`server/create.js`), поэтому в клиент не попадают.
 */
export { actionsFor, actorOf, nextRandom, pickWeighted } from './decide.js';

/** Отпечаток состояния: по нему видно, изменилось ли что-то после действия. */
const signature = state =>
  JSON.stringify({
    hook: state.hook,
    round: state.round,
    turn: [state.turn?.playerId, state.turn?.actionsLeft],
    combat: [
      state.combat?.stage,
      state.combat?.attackerFighterId,
      state.combat?.targetFighterId,
      state.combat?.choice?.playerId,
      state.combat?.choice?.picked ?? null,
      state.combat?.effects?.map(step => step.status),
    ],
    targeting: [state.targeting?.playerId, state.targeting?.picked ?? null],
    movement: [state.movement?.playerId, state.movement?.moves?.length ?? 0],
    effect: [state.effect?.source ?? null, state.effect?.steps?.map(step => step.status)],
    fighters: (state.players ?? []).map(player =>
      (player.fighters ?? []).map(fighter => [
        fighter.id,
        fighter.currentPosition,
        fighter.currentHp,
      ]),
    ),
    zones: (state.players ?? []).map(player => [
      player.hand?.cards?.length ?? 0,
      player.deck?.cards?.length ?? 0,
      player.discard?.cards?.length ?? 0,
    ]),
    items: (state.players ?? []).map(player => (player.items ?? []).map(item => item.state)),
    // расстановка: подтверждение кнопкой «ОК» меняет только эти два флага — без них шаг
    // выглядел бы пустым действием и прогон обрывался бы на первом же подтверждении
    placement: (state.players ?? []).map(player => [
      player.placementReady === true,
      player.numberedHeroCommitted === true,
    ]),
  });

/**
 * Проверки, которые должны выполняться в любой момент партии: бойцы на существующих клетках,
 * один боец на клетку, здоровье не выше начального. Нарушение — такой же баг, как падение.
 */
export const invariantViolation = state => {
  const nodes = new Set((state.map?.nodes ?? []).map(node => String(node.id)));
  const occupied = new Map();

  for (const player of state.players ?? []) {
    for (const fighter of player.fighters ?? []) {
      if (fighter.currentPosition == null) continue;
      const cell = String(fighter.currentPosition);
      if (!nodes.has(cell)) {
        return `боец ${fighter.id} стоит на несуществующей клетке ${cell}`;
      }
      if (occupied.has(cell)) {
        return `на клетке ${cell} двое: ${occupied.get(cell)} и ${fighter.id}`;
      }
      occupied.set(cell, fighter.id);

      if (fighter.startHp != null && Number(fighter.currentHp) > Number(fighter.startHp)) {
        return `${fighter.id}: здоровье ${fighter.currentHp} выше начального ${fighter.startHp}`;
      }
    }
  }

  return null;
};

export const createDuel = (
  seed,
  testId,
  { heroBFirst = false, mapId = 'generated', heroA = 'medusa', heroB = 'tesla', vsAi = false } = {},
) => {
  // порядок в массиве не важен: `createGame` сортирует слоты по `order`
  const slotA = {
    heroId: heroA,
    team: heroBFirst ? 'B' : 'A',
    order: heroBFirst ? 2 : 1,
    control: 'human',
  };
  // `vsAi` — партия, где вторым играет компьютер (режим `vs_ai`): так проверяется и клиентский цикл
  const slotB = {
    heroId: heroB,
    team: heroBFirst ? 'A' : 'B',
    order: heroBFirst ? 1 : 2,
    control: vsAi ? 'ai' : 'human',
  };

  createGame(
    { mapId, mode: vsAi ? 'vs_ai' : 'hotseat', heroes: [slotA, slotB] },
    { testId, testSeed: seed },
  );
  return load(testId);
};

/**
 * Один прогон партии: бот играет до `gameEnd`, до пустого экрана или до лимита шагов.
 * Возвращает отчёт: статус, шаги, лог действий (по нему баг воспроизводится) и подробности.
 * `onStep` — точка для отладки: вызывается перед каждым действием и получает само действие (`payload`),
 * список вариантов (`options`) и состояние до хода.
 * `policy` — политика того, кто ходит первым, `policyB` — второго (по умолчанию та же): разные политики
 * нужны для «лестницы» — насколько осмысленная игра сильнее случайной.
 */
export const playDuel = ({
  seed = 1,
  maxSteps = 400,
  testId = `fuzz_${seed}`,
  mapId = 'generated',
  heroA = 'medusa',
  heroB = 'tesla',
  policy = 'random',
  policyB = null,
  onStep = null,
} = {}) => {
  // предел шагов приходит и снаружи, и флагами CLI: `null`/0 значит «по умолчанию», иначе цикл ниже
  // не сделал бы ни шага (0 < null — ложь) и партия сразу считалась бы незавершённой
  const limit = Number.isFinite(Number(maxSteps)) && Number(maxSteps) > 0 ? Number(maxSteps) : 400;
  const rng = { value: (Number(seed) || 1) >>> 0 };
  const heroBFirst = (Number(seed) || 1) % 2 === 0;
  // стиль партии: одни сиды играют агрессивно, другие осторожно
  const style = ((Number(seed) || 1) % 4) + 1;
  // каждый пятый прогон «осторожный»: там бот отказывается от свойств (проверяем и путь отказа)
  const skipAllowed = (Number(seed) || 1) % 5 === 0;
  let state = createDuel(seed, testId, { heroBFirst, mapId, heroA, heroB });
  const log = [];
  const metrics = createMetrics();
  let previous = signature(state);

  /** Кто ходит первым: его политика — `policy`, у второго — `policyB` (или та же). */
  const firstHeroId = (state.settings?.heroes ?? [])
    .slice()
    .sort((left, right) => Number(left.order) - Number(right.order))[0]?.heroId;
  const policyOf = playerId =>
    policyB != null && String(playerId) !== String(firstHeroId) ? policyB : policy;

  /** Отчёт с метриками: у всех исходов одна форма, поэтому собирается в одном месте. */
  const report = (status, steps, extra = {}) => ({
    status,
    seed,
    steps,
    log,
    state,
    metrics,
    ...extra,
  });

  for (let step = 0; step < limit; step += 1) {
    if (state.hook === 'gameEnd') {
      if (state.winner == null) {
        return report('invalid', step, {
          detail: 'партия закончилась без победителя (ничьих быть не должно)',
        });
      }
      return report('finished', step);
    }

    const broken = invariantViolation(state);
    if (broken) return report('invalid', step, { detail: broken });

    const playerId = actorOf(state);
    if (playerId == null) {
      return report('deadlock', step, { detail: 'не нашёлся игрок, который действует' });
    }

    const options = actionsFor(state, playerId, {
      policy: policyOf(playerId),
      style,
      skipAllowed,
    });
    if (options.length === 0) {
      return report('deadlock', step, {
        detail: `нет легальных действий у ${playerId} (hook ${state.hook}, фаза ${
          runUi(state, playerId).phase ?? '—'
        })`,
      });
    }

    const action = pickWeighted(rng, options);
    const payload = { ...action, playerId };
    // `options` отдаются наружу целиком: у поиска в них лежат доли доигрываний этого решения
    // (`bot/play/decide.js`), по которым дневник пишет цель политики — без повторного пересчёта поиска
    if (onStep) onStep({ step, state, playerId, payload, options });
    noteAction(metrics, state, payload);
    const before = snapshotHp(state);

    let next;
    try {
      next = runAction(state, payload);
    } catch (error) {
      return report('crash', step, {
        action: payload,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    const current = signature(next);
    if (current === previous) {
      return report('noop', step, { action: payload, detail: 'действие не изменило состояние' });
    }

    noteTransition(metrics, before, next, step);
    previous = current;
    log.push(payload);
    state = next;
  }

  return report('stuck', limit);
};

export default playDuel;
