import { describe, expect, it } from 'vitest';
import { featureNames, featuresOf } from '../../../bot/play/value.js';
import { createState } from '../../fixtures/state.js';

/**
 * Признаки листа про поле: родная стихия, чужой боец в моей зоне, близость к врагу и сброс.
 * Раньше модель их не видела вовсе (`bot/play/value.js`): 15 базовых признаков считали здоровье,
 * карты и ресурс, а геометрия и стихии в оценку не входили. Здесь стережётся смысл каждого признака.
 */
const lineMap = {
  id: 'leaf',
  name: 'Leaf',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'desert' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2], terrain: 'lava' },
  ],
};

const index = name => featureNames.indexOf(name);
const feature = (state, viewerId, name) => featuresOf(state, viewerId)[index(name)];

/** Анубис на пустыне (1), Ифрит на лаве (3): у каждого своя родная стихия из правил его карт. */
const stateOf = () => {
  const state = createState({ map: lineMap });
  state.players[0].heroId = 'anubis';
  state.players[1].heroId = 'ifrit';
  const alpha = state.players[0].fighters.find(fighter => fighter.type === 'hero');
  const beta = state.players[1].fighters.find(fighter => fighter.type === 'hero');
  alpha.currentPosition = 1;
  beta.currentPosition = 3;
  return { state, alpha, beta };
};

describe('признаки листа про поле', () => {
  it('бойцы на родной стихии дают перевес, а вне её — нет', () => {
    const { state, alpha } = stateOf();
    // оба на своей земле: пустыня у Анубиса, лава у Ифрита — перевеса нет
    expect(feature(state, '0', 'terrainStand')).toBeCloseTo(0);

    // Анубис ушёл с пустыни на лёд, Ифрит остался на лаве — перевес у противника
    alpha.currentPosition = 2;
    expect(feature(state, '0', 'terrainStand')).toBeCloseTo(-0.5);
    expect(feature(state, '1', 'terrainStand')).toBeCloseTo(0.5);
  });

  it('чужой боец на моей стихии отнимает контроль над полем', () => {
    const { state, beta } = stateOf();
    // Ифрит стоит на пустыне — земле Анубиса
    beta.currentPosition = 1;
    expect(feature(state, '0', 'terrainFoe')).toBeCloseTo(-0.5);
    expect(feature(state, '1', 'terrainFoe')).toBeCloseTo(0);
  });

  it('близость к врагу растёт по мере сближения героев', () => {
    const { state, beta } = stateOf();
    const far = feature(state, '0', 'distance');
    beta.currentPosition = 2;
    const near = feature(state, '0', 'distance');
    expect(far).toBeCloseTo(0.6); // два шага по линиям поля
    expect(near).toBeCloseTo(0.8); // один шаг
  });

  it('сброс считается вторым запасом карт', () => {
    const { state } = stateOf();
    const before = feature(state, '0', 'discard');
    state.players[0].discard = { visibility: [], cards: [{ id: 'gone', title: 'Gone', bonus: 1 }] };
    expect(feature(state, '0', 'discard')).toBeGreaterThan(before);
  });

  it('ступени ресурса видят расстояние до следующего порога карт', () => {
    const { state } = stateOf();
    state.players[0].heroId = 'snow-queen';
    const shards = count =>
      (state.players[0].discard = {
        visibility: [],
        cards: Array.from({ length: count }, (_, index) => ({
          id: `shard_${index}`,
          title: 'Осколок',
          tags: ['shard'],
        })),
      });

    // ступени Снежной королевы — 4/5/6/7: до первой четыре осколка
    shards(0);
    expect(feature(state, '0', 'resourceShare')).toBeCloseTo(0);
    expect(feature(state, '0', 'resourceStep')).toBeCloseTo(4 / 7);

    // четыре собраны — следующая ступень в одном осколке
    shards(4);
    expect(feature(state, '0', 'resourceStep')).toBeCloseTo(1 / 7);
    expect(feature(state, '0', 'resourceShare')).toBeCloseTo(4 / 7);

    // верхняя ступень взята — идти некуда
    shards(7);
    expect(feature(state, '0', 'resourceStep')).toBeCloseTo(0);
    expect(feature(state, '0', 'resourceShare')).toBeCloseTo(1);
  });
});
