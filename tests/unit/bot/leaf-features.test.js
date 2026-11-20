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
    const { state, alpha, beta } = stateOf();
    // Ифрит занял пустыню — землю Анубиса, а сам Анубис ушёл на лёд
    alpha.currentPosition = 2;
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

    // ступени Снежной королевы — 3/4/5/6: до первой три осколка
    shards(0);
    expect(feature(state, '0', 'resourceShare')).toBeCloseTo(0);
    expect(feature(state, '0', 'resourceStep')).toBeCloseTo(3 / 6);

    // два собраны — до ступени остался один осколок
    shards(2);
    expect(feature(state, '0', 'resourceStep')).toBeCloseTo(1 / 6);
    expect(feature(state, '0', 'resourceShare')).toBeCloseTo(2 / 6);

    // четыре собраны — следующая ступень снова в одном осколке
    shards(4);
    expect(feature(state, '0', 'resourceStep')).toBeCloseTo(1 / 6);
    expect(feature(state, '0', 'resourceShare')).toBeCloseTo(4 / 6);

    // верхняя ступень взята — идти некуда
    shards(6);
    expect(feature(state, '0', 'resourceStep')).toBeCloseTo(0);
    expect(feature(state, '0', 'resourceShare')).toBeCloseTo(1);
  });
});

/**
 * Сроки и важность помощника (§74, «осталось»): временная стихия живёт до конца хода, статус — до
 * ближайшего конца хода или до конца хода владельца, а важный помощник (Амат, вороны, Тото) не равен
 * обычному телу. Раньше лист ничего из этого не различал.
 */
describe('признаки листа про сроки и важность помощника', () => {
  it('временная стихия считается отдельно от постоянной', () => {
    const { state } = stateOf();
    // оба на своей постоянной земле: перевеса нет, временной стихии тоже
    expect(feature(state, '0', 'tempTerrain')).toBeCloseTo(0);
    expect(feature(state, '0', 'terrainStand')).toBeCloseTo(0);

    // на клетку Анубиса положили временный песок (карта «до конца хода»)
    state.map = {
      ...state.map,
      nodes: state.map.nodes.map(node =>
        node.id === 1 ? { ...node, extraTerrain: ['desert'], extraTerrainBy: '0' } : node,
      ),
    };
    expect(feature(state, '0', 'tempTerrain')).toBeCloseTo(0.5);
    // чужая временная стихия — отдельный признак, у меня она ноль
    expect(feature(state, '0', 'foeTempTerrain')).toBeCloseTo(0);
  });

  it('статусы делятся по сроку: до ближайшего конца хода и до конца хода владельца', () => {
    const { state, beta } = stateOf();
    // заморожен враг: у него короткий срок — значит «минус» у него (признаки считаются «я минус они»)
    beta.statuses = { frozen: { until: 'turnEnd' } };
    expect(feature(state, '0', 'statusShort')).toBeCloseTo(-0.5);
    expect(feature(state, '0', 'statusLong')).toBeCloseTo(0);

    beta.statuses = { frozen: { until: 'ownerTurnEnd' } };
    expect(feature(state, '0', 'statusShort')).toBeCloseTo(0);
    expect(feature(state, '0', 'statusLong')).toBeCloseTo(-0.5);
    // «заморожен» остаётся общей суммой: срок — уточнение, а не замена
    expect(feature(state, '0', 'frozen')).toBeCloseTo(-0.5);
  });

  it('важный помощник весит в листе отдельно от обычного тела', () => {
    const { state } = stateOf();
    // у Анубиса Амат важна (8 hp, на ней пелена)
    state.players[0].fighters.push({
      id: 'amat',
      name: 'Амат',
      type: 'assistant',
      group: 'amat',
      currentHp: 6,
      currentPosition: 2,
    });
    expect(feature(state, '1', 'keyBodies')).toBeCloseTo(-0.5); // глазами Ифрита это чужой важный
    expect(feature(state, '0', 'keyBodies')).toBeCloseTo(0.5);

    // у Медузы гарпия — обычный рой, важной не считается
    state.players[1].fighters.push({
      id: 'harpy',
      name: 'Гарпия',
      type: 'assistant',
      group: 'harpies',
      currentHp: 1,
      currentPosition: 2,
    });
    state.players[1].heroId = 'medusa';
    expect(feature(state, '0', 'keyBodies')).toBeCloseTo(0.5);
  });
});
