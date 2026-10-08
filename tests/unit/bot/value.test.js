import { describe, expect, it } from 'vitest';
import { playDuel } from '../../../bot/play/duel.js';
import {
  baseFeatureNames,
  defaultWeights,
  featureNames,
  featuresOf,
  scoreOf,
} from '../../../bot/play/value.js';
import trainedWeights from '../../../bot/play/value-weights.js';
import { card, createState, player } from '../../fixtures/state.js';

/**
 * Оценка листа (`bot/play/value.js`) — то, чем поиск решает, какой лист лучше. Проверяем не «функция
 * посчиталась», а смысл: знак при перевесе, терминал, полноту обученных весов и то, что модель вообще
 * отличает выигранную партию от проигранной на настоящих позициях.
 */
const stateOf = () =>
  createState({
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
  });

describe('признаки оценки', () => {
  it('признаки считаются в разнице «наше минус их» и в том же порядке, что веса', () => {
    const state = stateOf();
    const features = featuresOf(state, '0');
    expect(features).toHaveLength(featureNames.length);
    for (const value of features) expect(Number.isFinite(value)).toBe(true);

    // перевес по здоровью героя: у alpha 15, у beta 13 — признак положительный для игрока 0
    expect(features[0]).toBeGreaterThan(0);
    // и симметричен для противника
    expect(featuresOf(state, '1')[0]).toBeLessThan(0);
  });

  it('терминал важнее признаков: победа — это +1, поражение — −1', () => {
    const state = stateOf();
    const win = { ...state, hook: 'gameEnd', winner: '0' };
    expect(scoreOf(win, '0')).toBe(1);
    expect(scoreOf(win, '1')).toBe(-1);
  });

  it('оценка растёт, когда бойцу снимают здоровье', () => {
    const state = stateOf();
    const before = scoreOf(state, '0');
    player(state, '1').fighters[0].currentHp = 1;
    expect(scoreOf(state, '0')).toBeGreaterThan(before);
  });

  it('веса по умолчанию и обученные описывают одни и те же признаки', () => {
    for (const name of featureNames) {
      expect(Number.isFinite(defaultWeights[name]), name).toBe(true);
      expect(Number.isFinite(trainedWeights[name]), name).toBe(true);
    }
  });

  it('обученная модель отличает выигранные позиции от проигранных на настоящих партиях', () => {
    const scored = [];

    for (const seed of [1, 2, 3, 4]) {
      let previous = null;
      const report = playDuel({
        seed,
        heroA: 'anubis',
        heroB: 'tesla',
        policy: 'greedy',
        onStep: ({ step, state, playerId }) => {
          if (step % 25 !== 0) return;
          previous = { score: scoreOf(state, playerId), playerId: String(playerId) };
        },
      });
      if (report.status !== 'finished' || previous == null) continue;
      scored.push({ ...previous, won: previous.playerId === String(report.state.winner) });
    }

    expect(scored.length).toBeGreaterThan(2);
    // у победителя средняя оценка выше, чем у проигравшего: модель смотрит в правильную сторону
    const winners = scored.filter(row => row.won).map(row => row.score);
    const losers = scored.filter(row => !row.won).map(row => row.score);
    const mean = list => (list.length === 0 ? 0 : list.reduce((a, b) => a + b, 0) / list.length);
    expect(mean(winners)).toBeGreaterThan(mean(losers));
  });
});

/**
 * Блок героя в признаках (§18). Он появился потому, что без него общие признаки работали прокси
 * архетипа: «живых бойцов больше» и «предметы заряжены» у разных героев значат разное. Проверяем, что
 * индикаторы действительно указывают на своего героя, а взаимодействия включены только для него.
 */
describe('признаки героя', () => {
  const indexOf = name => featureNames.indexOf(name);

  const heroState = () => {
    const state = stateOf();
    player(state, '0').heroId = 'anubis';
    player(state, '1').heroId = 'dorothy';
    return state;
  };

  it('индикаторы героя показывают своего героя и чужого', () => {
    const state = heroState();
    const mine = featuresOf(state, '0');
    expect(mine[indexOf('hero:anubis')]).toBe(1);
    expect(mine[indexOf('hero:dorothy')]).toBe(0);
    expect(mine[indexOf('rival:dorothy')]).toBe(1);
    expect(mine[indexOf('rival:anubis')]).toBe(0);

    const theirs = featuresOf(state, '1');
    expect(theirs[indexOf('hero:dorothy')]).toBe(1);
    expect(theirs[indexOf('rival:anubis')]).toBe(1);
  });

  it('взаимодействие повторяет базовый признак только для своего героя', () => {
    const features = featuresOf(heroState(), '0');
    expect(features[indexOf('fighters@anubis')]).toBe(features[indexOf('fighters')]);
    expect(features[indexOf('fighters@dorothy')]).toBe(0);
  });

  it('незнакомый герой не ломает признаки: базовые остаются на месте', () => {
    const state = heroState();
    player(state, '0').heroId = 'unknown-hero';
    const features = featuresOf(state, '0');
    expect(features).toHaveLength(featureNames.length);
    expect(features.slice(0, baseFeatureNames.length)).toEqual(
      featuresOf(heroState(), '0').slice(0, baseFeatureNames.length),
    );
  });
});

/**
 * Признаки состояния (§20): покой героя, запас чужой руки, помощники отдельно от героя и заморозка.
 * Они появились из инвентаря условий всех шести паков — это то, что читают сами карты героев.
 */
describe('признаки состояния', () => {
  const indexOf = name => featureNames.indexOf(name);

  it('покой: герой не двигался; шаг помощника его не ломает', () => {
    const state = stateOf();
    expect(featuresOf(state, '0')[indexOf('stillness')]).toBe(1);

    player(state, '0').fighters.find(fighter => fighter.type === 'assistant').movedThisTurn = true;
    expect(featuresOf(state, '0')[indexOf('stillness')]).toBe(1);

    player(state, '0').fighters.find(fighter => fighter.type === 'hero').movedThisTurn = true;
    expect(featuresOf(state, '0')[indexOf('stillness')]).toBe(0);
  });

  it('чужая рука считается как запас, а не как разница', () => {
    const state = stateOf();
    player(state, '1').hand.cards = Array.from({ length: 4 }, (_, index) =>
      card({ id: `enemy_${index}` }),
    );
    expect(featuresOf(state, '0')[indexOf('rivalHand')]).toBeCloseTo(4 / 7);
  });

  it('помощники отдельно от героя и заморозка врага', () => {
    const state = stateOf();
    // у игрока 0 жив помощник с 4 hp, у игрока 1 помощников нет
    expect(featuresOf(state, '0')[indexOf('sidekickHp')]).toBeCloseTo(4 / 12);

    player(state, '1').fighters[0].frozen = true;
    expect(featuresOf(state, '0')[indexOf('frozen')]).toBeCloseTo(-0.5);
  });
});
