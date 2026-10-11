import { describe, expect, it } from 'vitest';
import { actionsFor, playDuel } from '../../../bot/play/duel.js';
import { mlpScore } from '../../../bot/play/qvalue.js';
import { featuresOf } from '../../../bot/play/value.js';
import { actionFeatures, heroOf, rivalOf } from '../../../bot/play/actionFeatures.js';
import base from '../../../bot/play/qvalue-weights.js';

/**
 * Две головы модели (§49): у артефакта `twoHeads` шаги (клетки) считает своя пара «ствол + выход», а
 * карты, добор, бойцы и «закончить» — общая. Рантайм обязан выбрать **ту же** голову, что и тренер
 * (`trainer/model.py`), иначе в игре модель считает не то, чему её учили: маршрут у обоих — признак 3
 * вектора действия («это клетка»).
 */
const firstState = seed => {
  let found = null;
  playDuel({
    seed,
    heroA: 'anubis',
    heroB: 'tesla',
    policy: 'greedy',
    maxSteps: 6,
    onStep: ({ state, playerId }) => {
      if (found == null) found = { state: structuredClone(state), playerId };
    },
  });
  return found;
};

/** Живой артефакт плюс головы клеток: они отличаются от общих ровно на заданный сдвиг выхода. */
const withCellBias = (table, bias) => ({
  ...table,
  twoHeads: true,
  W1Cell: table.W1,
  b1Cell: table.b1,
  W2Cell: table.W2,
  b2Cell: table.b2,
  WscoreCell: table.Wscore,
  bscoreCell: table.bscore.map(value => (Number(value) || 0) + bias),
});

describe('две головы модели: маршрут по виду действия', () => {
  it('артефакт с головами грузится, и сдвиг головы клеток виден только на шагах', () => {
    const start = firstState(4);
    expect(start).not.toBeNull();

    const entries = actionsFor(start.state, start.playerId, { policy: 'greedy' }).filter(
      entry => Number(entry.weight) > 0,
    );
    expect(entries.length).toBeGreaterThan(0);

    const stateFeatures = featuresOf(start.state, start.playerId);
    const hero = heroOf(start.state, start.playerId);
    const rival = rivalOf(start.state, start.playerId);
    const shifted = withCellBias(base, 0.5);

    const deltas = { cell: [], other: [] };
    for (const entry of entries) {
      const action = actionFeatures(start.state, start.playerId, entry);
      const plain = mlpScore(base, { stateFeatures, action, hero, rival, card: null });
      const moved = mlpScore(shifted, { stateFeatures, action, hero, rival, card: null });
      const target = (Number(action[3]) || 0) > 0.5 ? deltas.cell : deltas.other;
      target.push(moved - plain);
    }

    // варианты-не-клетки считает общая голова: сдвиг головы клеток их не касается
    for (const delta of deltas.other) expect(Math.abs(delta)).toBeLessThan(1e-9);
    // а шаги — считает голова клеток: она и сдвинулась
    if (deltas.cell.length > 0) {
      for (const delta of deltas.cell) expect(delta).toBeCloseTo(0.5, 6);
    }
  });

  it('артефакт без голов играет как раньше: маршрут не выдумывается', () => {
    const start = firstState(5);
    const entries = actionsFor(start.state, start.playerId, { policy: 'greedy' }).filter(
      entry => Number(entry.weight) > 0,
    );
    const stateFeatures = featuresOf(start.state, start.playerId);
    const hero = heroOf(start.state, start.playerId);
    const rival = rivalOf(start.state, start.playerId);
    const action = actionFeatures(start.state, start.playerId, entries[0]);

    const once = mlpScore(base, { stateFeatures, action, hero, rival, card: null });
    const twice = mlpScore(base, { stateFeatures, action, hero, rival, card: null });
    expect(once).toBe(twice);
    expect(Number.isFinite(once)).toBe(true);
  });
});

/**
 * Ворота «состояние × действие» (§50): `a' = a · σ(G · summary + g0)`. Проверяем две вещи, которые
 * легко сломать молча: (1) при нулевых весах ворот оценка **совпадает** с той же моделью без ворот,
 * умноженной на общую половинную шкалу (σ(0) = 0,5) — то есть старт не «портит» модель; (2) ненулевые
 * ворота действуют **по позиции**: две разные позиции дают разные оценки одного и того же действия.
 */
describe('ворота «состояние × действие»: маршрут признаков через позицию', () => {
  const withoutGates = table => {
    const shaped = { ...table };
    delete shaped.gated;
    delete shaped.Wgate;
    delete shaped.bgate;
    delete shaped.summaryIndex;
    return shaped;
  };

  it('нулевые ворота — половинная шкала действий (σ(0) = 0,5), а не другое поведение', () => {
    const start = firstState(7);
    const entries = actionsFor(start.state, start.playerId, { policy: 'greedy' }).filter(
      entry => Number(entry.weight) > 0,
    );
    const stateFeatures = featuresOf(start.state, start.playerId);
    const hero = heroOf(start.state, start.playerId);
    const rival = rivalOf(start.state, start.playerId);

    // половинная шкала: у модели без ворот умножаем вектор действия на 0,5 и считаем тем же стволом
    const half = model =>
      mlpScore(model, {
        stateFeatures,
        action: actionFeatures(start.state, start.playerId, entries[0]).map(value => value * 0.5),
        hero,
        rival,
        card: null,
      });
    const gates = { ...withoutGates(base), gated: true, summaryIndex: [0, 1, 2, 3, 4, 7, 9, 11] };
    gates.Wgate = new Array(23 * 8).fill(0);
    gates.bgate = new Array(23).fill(0);

    const plain = model =>
      mlpScore(model, {
        stateFeatures,
        action: actionFeatures(start.state, start.playerId, entries[0]),
        hero,
        rival,
        card: null,
      });

    expect(
      mlpScore(gates, {
        stateFeatures,
        action: actionFeatures(start.state, start.playerId, entries[0]),
        hero,
        rival,
        card: null,
      }),
    ).toBeCloseTo(half(withoutGates(base)), 6);
    expect(Number.isFinite(plain(base))).toBe(true);
  });

  it('ненулевые ворота зависят от позиции: то же действие — другая оценка', () => {
    const first = firstState(9);
    // сид другой чётности: у `playDuel` от сида зависят и поле, и порядок хода, поэтому позиции разные
    const second = firstState(20);
    const entries = actionsFor(first.state, first.playerId, { policy: 'greedy' }).filter(
      entry => Number(entry.weight) > 0,
    );
    const target = actionFeatures(first.state, first.playerId, entries[0]);
    const hero = heroOf(first.state, first.playerId);
    const rival = rivalOf(first.state, first.playerId);

    const gates = { ...withoutGates(base), gated: true, summaryIndex: [0, 1, 2, 3, 4, 7, 9, 11] };
    // ворота «реагируют» на здоровье героя (индекс 0): у двух позиций оно разное
    gates.Wgate = new Array(23 * 8).fill(0);
    gates.bgate = new Array(23).fill(0);
    for (let column = 0; column < 23; column += 1) gates.Wgate[column * 8 + 0] = 1;

    const scoreAt = state => {
      const features = featuresOf(state, first.playerId);
      return mlpScore(gates, {
        stateFeatures: features,
        action: target,
        hero,
        rival,
        card: null,
      });
    };

    const a = scoreAt(first.state);
    const b = scoreAt(second.state);
    expect(Number.isFinite(a)).toBe(true);
    expect(Number.isFinite(b)).toBe(true);
    // признаки позиций разные (иначе проверять нечего) — и оценка одного действия тоже разная
    expect(JSON.stringify(featuresOf(first.state, first.playerId))).not.toBe(
      JSON.stringify(featuresOf(second.state, first.playerId)),
    );
    expect(a).not.toBe(b);
  });
});
