import { describe, expect, it } from 'vitest';
import { runAction } from '#shared/publicApi.js';
import { actionsFor, playDuel } from '../../../bot/play/duel.js';
import { myTurnOf, planBudget, planValue, turnPlan } from '../../../bot/play/plan.js';
import { determinize, leafScore } from '../../../bot/play/search.js';

/**
 * Планировщик хода (`bot/play/plan.js`): решение — цепочка своих действий до конца хода, оценённая
 * доигрыванием до конца хода и ответа соперника. Проверяем свойства, на которых держится затея: план
 * легален и воспроизводим, он смотрит дальше одного действия, за соперника бот не решает, а ответ
 * соперника в оценке действительно учитывается.
 */
const captureState = (seed, predicate) => {
  let found = null;
  playDuel({
    seed,
    heroA: 'tesla',
    heroB: 'anubis',
    policy: 'greedy',
    maxSteps: 120,
    onStep: ({ step, state, playerId }) => {
      if (found == null && predicate({ step, state, playerId: String(playerId) })) {
        found = { state: structuredClone(state), playerId: String(playerId) };
      }
    },
  });
  return found;
};

/** Мой ход и есть из чего выбирать: самое интересное для плана состояние. */
const myTurnState = seed =>
  captureState(
    seed,
    ({ state, playerId }) =>
      myTurnOf(state, playerId) &&
      actionsFor(state, playerId, { policy: 'greedy' }).filter(entry => entry.weight > 0).length >=
        3,
  );

/**
 * Я действую в чужой ход (защита в бою соперника) — планировать тут нечего. Расстановка (`gameStart`)
 * сюда не годится: хода как такового ещё нет, `state.turn.playerId` пуст.
 */
const otherTurnState = seed =>
  captureState(
    seed,
    ({ state, playerId }) => state.turn?.playerId != null && !myTurnOf(state, playerId),
  );

/**
 * Состояние, где ход принадлежит сопернику, а смотрим мы за того, чей ход только что кончился: на такой
 * границе хода доигрывать нечего, и оценка плана — это оценка позиции как есть.
 */
const opponentTurnState = seed => {
  let found = null;
  playDuel({
    seed,
    heroA: 'tesla',
    heroB: 'anubis',
    policy: 'greedy',
    maxSteps: 120,
    onStep: ({ state }) => {
      const owner = state.turn?.playerId;
      if (found != null || owner == null) return;
      const mine = (state.players ?? [])
        .map(player => String(player.id))
        .find(id => String(id) !== String(owner));
      if (mine != null) found = { state: structuredClone(state), mine };
    },
  });
  return found;
};

describe('план на ход', () => {
  it('возвращает легальный ход и цепочку, которую движок принимает шаг за шагом', () => {
    const start = myTurnState(1);
    expect(start).not.toBeNull();

    const options = actionsFor(start.state, start.playerId, { policy: 'greedy' });
    const entries = options.map(entry => ({ action: entry.action, weight: entry.weight }));
    const plan = turnPlan(start.state, start.playerId, entries, { ...planBudget(), worlds: 2 });

    expect(plan).not.toBeNull();
    expect(entries.map(entry => JSON.stringify(entry.action))).toContain(
      JSON.stringify(plan.action),
    );
    expect(plan.plan.length).toBeGreaterThan(0);
    // первый шаг плана легален на настоящем состоянии
    expect(() =>
      runAction(start.state, { ...plan.action, playerId: start.playerId }),
    ).not.toThrow();

    // а вся цепочка — в детерминизированном мире, в котором её считали
    const world = determinize(start.state, start.playerId, { value: 7 });
    let current = world;
    for (const step of plan.plan) {
      expect(() => {
        current = runAction(current, { ...step, playerId: start.playerId });
      }).not.toThrow();
    }
  });

  it('воспроизводим: то же состояние и бюджет — тот же план', () => {
    const start = myTurnState(2);
    const entries = actionsFor(start.state, start.playerId, { policy: 'greedy' }).map(entry => ({
      action: entry.action,
      weight: entry.weight,
    }));
    const budget = { ...planBudget(), worlds: 3 };

    const first = turnPlan(start.state, start.playerId, entries, budget);
    const second = turnPlan(start.state, start.playerId, entries, budget);
    expect(JSON.stringify(second.plan)).toBe(JSON.stringify(first.plan));
    expect(JSON.stringify(second.action)).toBe(JSON.stringify(first.action));
  });

  it('смотрит дальше одного действия: в плане бывает больше одного шага', () => {
    const plans = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const start = myTurnState(seed);
      if (start == null) continue;
      const entries = actionsFor(start.state, start.playerId, { policy: 'greedy' }).map(entry => ({
        action: entry.action,
        weight: entry.weight,
      }));
      const plan = turnPlan(start.state, start.playerId, entries, { ...planBudget(), worlds: 2 });
      if (plan != null) plans.push(plan);
    }

    expect(plans.length).toBeGreaterThan(0);
    expect(plans.some(plan => plan.plan.length > 1)).toBe(true);
    // по каждому первому шагу есть строка: видно, о чём бот думал
    const plan = plans[0];
    expect(plan.rows.length).toBeGreaterThan(0);
    for (const row of plan.rows) expect(Number.isFinite(row.mean)).toBe(true);
  });

  it('за соперника не решает: в чужой ход плана нет', () => {
    const start = otherTurnState(3);
    expect(start).not.toBeNull();

    const entries = actionsFor(start.state, start.playerId, { policy: 'greedy' }).map(entry => ({
      action: entry.action,
      weight: entry.weight,
    }));
    expect(turnPlan(start.state, start.playerId, entries, planBudget())).toBeNull();
  });

  it('на границе хода оценка плана — это оценка позиции, а с ответом соперника она уже другая', () => {
    const boundary = opponentTurnState(4);
    expect(boundary).not.toBeNull();
    const budget = planBudget();

    // мой ход кончился: доигрывать нечего, и оценка совпадает с оценкой позиции
    expect(planValue(boundary.state, boundary.mine, { ...budget, reply: false })).toBeCloseTo(
      leafScore(boundary.state, boundary.mine),
      6,
    );
    // с ответом соперника оценка считается уже после его хода — и он на неё влияет
    expect(planValue(boundary.state, boundary.mine, { ...budget, reply: true })).not.toBe(
      leafScore(boundary.state, boundary.mine),
    );
  });

  it('партия планировщиком доходит до конца', () => {
    // план хода дороже одного действия, поэтому проверяем одну партию и с запасом по времени
    const report = playDuel({
      seed: 5,
      heroA: 'medusa',
      heroB: 'tesla',
      policy: 'chain',
      policyB: 'greedy',
    });

    expect(report.status).toBe('finished');
  }, 60000);
});
