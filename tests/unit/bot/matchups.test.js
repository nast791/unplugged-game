import { describe, expect, it } from 'vitest';
import { playDuel } from '../../../bot/play/duel.js';
import { matchupPairs, pairScore, pairWeights, projectPair } from '../../../bot/play/matchups.js';
import { baseFeatureNames, scoreOf } from '../../../bot/play/value.js';
import trainedWeights from '../../../bot/play/value-weights.js';

/**
 * Матрица матчапов (`bot/play/matchups.js`) — проекция обученной модели на пару героев. Главное свойство:
 * проекция **точная**, поэтому по артефакту видно ровно то, чем играет оценка, и никакие числа не
 * расходятся с моделью. Проверяем и математику проекции, и сам записанный файл.
 */
const lastPosition = (heroA, heroB) => {
  let last = null;
  playDuel({
    seed: 3,
    heroA,
    heroB,
    policy: 'greedy',
    onStep: ({ state, playerId }) => {
      last = { state, playerId: String(playerId) };
    },
  });
  return last;
};

describe('проекция модели на пару', () => {
  it('веса пары дают то же число, что полный вектор признаков', () => {
    const position = lastPosition('anubis', 'medusa');
    expect(position).not.toBeNull();

    const table = {
      meta: null,
      pairs: {
        anubis: { vs: { medusa: projectPair(trainedWeights, 'anubis', 'medusa') } },
        medusa: { vs: { anubis: projectPair(trainedWeights, 'medusa', 'anubis') } },
      },
    };
    const projected = pairScore(position.state, position.playerId, table);
    const full = scoreOf(position.state, position.playerId, trainedWeights);

    expect(projected).not.toBeNull();
    expect(projected).toBeCloseTo(full, 10);
  });

  it('неизвестная пара не выдумывает веса: оценка остаётся ручной формуле', () => {
    const position = lastPosition('anubis', 'medusa');
    expect(pairWeights('anubis', 'нет-такого', { pairs: {} })).toBe(null);
    expect(pairScore(position.state, position.playerId, { pairs: {} })).toBe(null);
  });

  it('терминал важнее признаков: победа — это +1, поражение — −1', () => {
    const position = lastPosition('anubis', 'medusa');
    const win = { ...position.state, hook: 'gameEnd', winner: position.playerId };
    expect(pairScore(win, position.playerId)).toBe(1);
    expect(pairScore(win, position.playerId === 'anubis' ? 'medusa' : 'anubis')).toBe(-1);
  });
});

describe('записанный артефакт матчапов', () => {
  it('описывает все упорядоченные пары и те же базовые признаки', () => {
    const pairs = matchupPairs();
    expect(pairs.length).toBeGreaterThanOrEqual(30);

    for (const { mine, rival } of pairs) {
      const pair = pairWeights(mine, rival);
      expect(Object.keys(pair.weights).sort(), `${mine} против ${rival}`).toEqual(
        [...baseFeatureNames].sort(),
      );
      expect(Number.isFinite(pair.constant)).toBe(true);
    }
  });

  it('оценка по артефакту совпадает с моделью на настоящей позиции', () => {
    const position = lastPosition('anubis', 'medusa');
    // артефакт хранит три знака: точность проекции проверяется выше, здесь — сам записанный файл
    expect(pairScore(position.state, position.playerId)).toBeCloseTo(
      scoreOf(position.state, position.playerId, trainedWeights),
      3,
    );
  });

  it('совпадение держится на всех шагах партии, а не только в конце', () => {
    let checked = 0;
    playDuel({
      seed: 11,
      heroA: 'anubis',
      heroB: 'medusa',
      policy: 'greedy',
      onStep: ({ state, playerId }) => {
        const projected = pairScore(state, playerId);
        if (projected == null) return;
        // артефакт хранит три знака: округление даёт расхождение до ~0,01, математика проекции точная
        expect(projected).toBeCloseTo(scoreOf(state, playerId, trainedWeights), 2);
        checked += 1;
      },
    });

    expect(checked).toBeGreaterThan(20);
  });
});
