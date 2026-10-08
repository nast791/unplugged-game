import { describe, expect, it } from 'vitest';
import { playDuel } from '../../../bot/play/duel.js';
import { featureNames, featuresOf } from '../../../bot/play/value.js';
import {
  resourceOf,
  resourceProgress,
  resourceReady,
  resourceSpec,
} from '../../../bot/play/resources.js';
import { card, createState, player } from '../../fixtures/state.js';

/**
 * Ресурс героя (`bot/play/resources.js`) читается из пака, а не из списка состояний. Проверяем смысл:
 * у каждого героя с запасом порог берётся из его правил, готовность — из того источника, который эти
 * правила читают (копии предмета или сброс), топливо — из карт, которые ресурсом двигают.
 */
const stateOf = (mineHero, otherHero) => {
  const state = createState({
    turn: { index: 1, playerId: '0', actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
  });
  player(state, '0').heroId = mineHero;
  player(state, '1').heroId = otherHero;
  return state;
};

const setCoils = (state, count, stateName = 'active', playerId = '0') => {
  player(state, playerId).items = Array.from({ length: count }, (_, index) => ({
    id: `coil_${index + 1}`,
    group: 'coil',
    state: stateName,
  }));
};

const shardCards = (count, tag) =>
  Array.from({ length: count }, (_, index) =>
    card({ id: `s${index}`, tags: tag ? ['shard'] : [] }),
  );

describe('ресурс героя из пака', () => {
  it('порог и готовое состояние берутся из правил героя', () => {
    // «обе катушки активны» — порог 2, готовое состояние active
    expect(resourceSpec('tesla')).toMatchObject({
      kind: 'item',
      group: 'coil',
      state: 'active',
      need: 2,
    });
    // пелена: порог 1, а готовым считается active, а не стартовое inactive
    expect(resourceSpec('anubis')).toMatchObject({
      kind: 'item',
      group: 'shroud',
      state: 'active',
      need: 1,
    });
    // у Снежной королевы правила считают осколки в сбросе, а не копии предмета-табло
    expect(resourceSpec('snow-queen')).toMatchObject({ kind: 'card', tag: 'shard', need: 6 });
  });

  it('у героя без запаса ресурса нет', () => {
    for (const heroId of ['dorothy', 'ifrit', 'medusa', 'unknown-hero']) {
      expect(resourceSpec(heroId), heroId).toBe(null);
    }
  });

  it('незнакомый герой не ломает оценку', () => {
    const state = stateOf('unknown-hero', 'dorothy');
    expect(() => featuresOf(state, '0')).not.toThrow();
    expect(resourceOf(player(state, '0'))).toEqual({ ready: 0, need: 0, fuel: 0 });
  });
});

describe('готовность ресурса', () => {
  it('катушки: одна активна — половина, обе — механика включена', () => {
    const state = stateOf('tesla', 'dorothy');
    const tesla = player(state, '0');

    setCoils(state, 2, 'inactive');
    expect(resourceProgress(resourceOf(tesla))).toBe(0);

    setCoils(state, 1, 'active');
    const half = resourceOf(tesla);
    expect(half.ready).toBe(1);
    expect(resourceProgress(half)).toBe(0.5);
    expect(resourceReady(half)).toBe(0);

    setCoils(state, 2, 'active');
    const full = resourceOf(tesla);
    expect(resourceProgress(full)).toBe(1);
    expect(resourceReady(full)).toBe(1);
  });

  it('осколки: источник правды — сброс, а не копии табло', () => {
    const state = stateOf('snow-queen', 'dorothy');
    const queen = player(state, '0');

    // табло собрано целиком: 12 копий предмета, каждая со своим count из пака
    queen.items = Array.from({ length: 12 }, (_, index) => ({
      id: `shard_${index + 1}`,
      group: 'shard',
      count: 12,
      state: 'collected',
    }));
    expect(resourceOf(queen)).toMatchObject({ ready: 0, need: 6 });
    expect(resourceProgress(resourceOf(queen))).toBe(0);

    queen.discard.cards = shardCards(3, true);
    expect(resourceProgress(resourceOf(queen))).toBe(0.5);
    expect(resourceReady(resourceOf(queen))).toBe(0);

    // карты без метки осколка ресурсом не считаются
    queen.discard.cards = [...shardCards(5, true), ...shardCards(2, false)];
    expect(resourceOf(queen).ready).toBe(5);

    queen.discard.cards = shardCards(6, true);
    expect(resourceReady(resourceOf(queen))).toBe(1);
  });

  it('готовность не превышает единицу', () => {
    expect(resourceProgress({ ready: 12, need: 2 })).toBe(1);
    expect(resourceProgress({ ready: 3, need: 0 })).toBe(0);
    expect(resourceReady({ ready: 3, need: 0 })).toBe(0);
  });
});

describe('топливо в руке', () => {
  it('считаются карты пака, которые ресурс двигают, а не вся рука', () => {
    const state = stateOf('tesla', 'dorothy');
    const tesla = player(state, '0');
    const fuels = [...resourceSpec('tesla').fuel];
    expect(fuels.length).toBeGreaterThan(0);

    tesla.hand.cards = [card({ id: fuels[0] }), card({ id: 'not_a_tesla_card' })];
    expect(resourceOf(tesla).fuel).toBe(1);
  });

  it('у Снежной королевы топливо — карты с меткой осколка', () => {
    const state = stateOf('snow-queen', 'dorothy');
    const queen = player(state, '0');
    const fuels = [...resourceSpec('snow-queen').fuel];
    expect(fuels.length).toBeGreaterThanOrEqual(3);

    queen.hand.cards = [...fuels.slice(0, 2), 'other_01'].map(id => card({ id }));
    expect(resourceOf(queen).fuel).toBe(2);
  });
});

describe('признаки ресурса в оценке', () => {
  const indexOf = name => featureNames.indexOf(name);

  it('признаки считаются в разнице «наше минус их»', () => {
    const state = stateOf('tesla', 'snow-queen');
    setCoils(state, 2, 'active'); // моя механика включена, у неё осколков нет

    const mine = featuresOf(state, '0');
    expect(mine[indexOf('resource')]).toBe(1);
    expect(mine[indexOf('resourceOn')]).toBe(1);

    // обе механики включены — по ресурсу паритет, а не перевес
    player(state, '1').discard.cards = shardCards(6, true);
    expect(featuresOf(state, '0')[indexOf('resource')]).toBe(0);

    // её режим работает, мой нет: с моей стороны признак идёт в минус, с её — в плюс
    player(state, '0').items = [];
    expect(featuresOf(state, '0')[indexOf('resourceOn')]).toBe(-1);
    expect(featuresOf(state, '1')[indexOf('resourceOn')]).toBe(1);
    expect(featuresOf(state, '0')[indexOf('resource')]).toBe(-1);
  });

  it('у героя без ресурса признаки нулевые с обеих сторон', () => {
    const state = stateOf('dorothy', 'ifrit');
    const features = featuresOf(state, '0');
    expect(features[indexOf('resource')]).toBe(0);
    expect(features[indexOf('resourceOn')]).toBe(0);
    expect(features[indexOf('fuel')]).toBe(0);
  });

  it('в настоящих партиях ресурс героя двигается и порог включается', () => {
    const seen = new Map();

    for (const heroId of ['tesla', 'snow-queen']) {
      const values = new Set();
      playDuel({
        seed: 7,
        heroA: heroId,
        heroB: 'dorothy',
        policy: 'greedy',
        onStep: ({ state, playerId }) => {
          if (String(playerId) !== heroId) return;
          const resource = resourceOf(player(state, heroId));
          values.add(`${resource.ready}/${resource.need}/${resourceReady(resource)}`);
        },
      });
      seen.set(heroId, values);
    }

    // ресурс не константа: у Теслы катушки заряжаются и тратятся, у Снежной королевы копятся осколки
    for (const [heroId, values] of seen) {
      expect(values.size, heroId).toBeGreaterThan(1);
    }
    // порог механики в партии действительно достигается (у Теслы — обе катушки активны)
    expect([...seen.get('tesla')].some(value => value.endsWith('/1'))).toBe(true);
  });
});
