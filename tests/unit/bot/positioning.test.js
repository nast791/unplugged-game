import { describe, expect, it } from 'vitest';
import {
  blockedDistances,
  exposureValue,
  fighterCells,
  foeRoomValue,
  guardValue,
  rearValue,
  routeBlockValue,
} from '../../../bot/play/actionFeatures.js';
import { actionsFor, banishValue, cellPlacementWeight, swapDelta } from '../../../bot/play/decide.js';
import { assistantImportance } from '../../../bot/play/pool.js';
import { handTerrains } from '../../../bot/play/cards.js';
import {
  SWAP_BODY,
  SWAP_HERO,
  TELEPORT_BASE,
  banishWeight,
  defenseWeight,
  movementWeight,
  swapWeight,
  teleportWeight,
  weightsFor,
} from '../../../bot/play/policy.js';
import { createState, fighter } from '../../fixtures/state.js';

/**
 * Позиция тела на карте: помощник — это в первую очередь перекрытие прохода к своему герою, а не «ещё
 * один стрелок». Проверяем то, чего у бота не было: занятость клеток, ценность перекрытия, подставу под
 * чужой удар и экономию карт (большая атака на мелкое тело, защита тела без механики).
 */

/**
 * Коридор: короткая дорога 1—2—3—4—5 (четыре шага), обход 1—6—7—8—9—5 (пять шагов). Тело, вставшее на
 * короткую дорогу, заставляет врага идти кругом — ровно это и должен видеть бот.
 */
const corridorMap = {
  id: 'corridor',
  name: 'Corridor',
  nodes: [
    { id: 1, neighbors: [2, 6], terrain: 'desert', x: 0, y: 0 },
    { id: 2, neighbors: [1, 3], terrain: 'desert', x: 1, y: 0 },
    { id: 3, neighbors: [2, 4], terrain: 'desert', x: 2, y: 0 },
    { id: 4, neighbors: [3, 5], terrain: 'desert', x: 3, y: 0 },
    { id: 5, neighbors: [4, 9], terrain: 'desert', x: 4, y: 0 },
    { id: 6, neighbors: [1, 7], terrain: 'ice', x: 0, y: 1 },
    { id: 7, neighbors: [6, 8], terrain: 'ice', x: 1, y: 1 },
    { id: 8, neighbors: [7, 9], terrain: 'ice', x: 2, y: 1 },
    { id: 9, neighbors: [8, 5], terrain: 'ice', x: 3, y: 1 },
  ],
};

const zone = cards => ({ visibility: [], cards: [...cards] });

const unit = (id, type, cell, hp, extra = {}) => ({
  ...fighter({ id, name: id, type, currentPosition: cell, currentHp: hp, ...extra }),
  startHp: hp,
});

const slot = (id, fighters) => ({
  id,
  name: id,
  order: Number(id) + 1,
  heroId: 'anubis',
  placementReady: true,
  deck: zone([]),
  hand: zone([]),
  discard: zone([]),
  fighters,
});

/** Своя героиня на 1, чужой герой на 5, помощница на 3 — в самом узком месте коридора. */
const corridorState = ({ pup = true } = {}) =>
  createState({
    map: corridorMap,
    players: [
      slot('0', [
        unit('hound', 'hero', 1, 14, { attackRange: 1 }),
        ...(pup ? [unit('pup', 'assistant', 3, 2, { group: 'amat' })] : []),
      ]),
      slot('1', [unit('rival', 'hero', 5, 16, { attackRange: 1 })]),
    ],
  });

describe('позиция: занятость клеток и перекрытие пути', () => {
  it('занятость видит и героев, и помощников', () => {
    const cells = fighterCells(corridorState());

    expect(cells.get('3')).toMatchObject({ playerId: '0', type: 'assistant', hp: 2 });
    expect(cells.get('5')).toMatchObject({ playerId: '1', type: 'hero' });
  });

  it('чужой боец перекрывает дорогу: обход длиннее коридора на шаг', () => {
    const state = corridorState();
    const blocked = structuredClone(state);
    blocked.players[0].fighters = blocked.players[0].fighters.filter(
      fighter => fighter.id !== 'pup',
    );
    const through = blockedDistances(blocked, 5, { viewerId: '1', goal: 1 });
    const around = blockedDistances(state, 5, { viewerId: '1', goal: 1 });

    // своё тело в коридоре: герой за ним, поэтому враг идёт обходом
    expect(through.get('1')).toBe(4);
    expect(around.get('1')).toBe(5);
  });

  it('ценность перекрытия: тело в узком месте стоит, тело у чужого героя — нет', () => {
    const state = corridorState({ pup: false });

    expect(guardValue(state, '0', 3)).toBeCloseTo(1 / 3, 5);
    expect(guardValue(state, '0', 2)).toBeCloseTo(1 / 3, 5);
    expect(guardValue(state, '0', 5)).toBe(0);
  });

  it('гипотетическое тело, которого ещё нет на поле, тоже закрывает путь', () => {
    const state = corridorState({ pup: false });
    const blocked = blockedDistances(state, 5, {
      viewerId: '1',
      goal: 1,
      extra: { cellId: 3, playerId: '0' },
    });

    expect(blocked.get('1')).toBe(5);
  });

  it('подстава под удар: клетки в чужой дальности считаются, дальние — нет', () => {
    const state = corridorState();
    const ranged = structuredClone(state);
    ranged.players[1].fighters[0].attackRange = 3;

    expect(exposureValue(ranged, '0', 4)).toBeCloseTo(1 / 3, 5);
    expect(exposureValue(ranged, '0', 2)).toBeCloseTo(1 / 3, 5);
    expect(exposureValue(ranged, '0', 1)).toBe(0);
  });
});

describe('позиция: вес шага с перекрытием и подставой', () => {
  const weights = weightsFor('trade', {});

  it('клетка-перекрытие весит дороже равного шага, клетка под тремя стволами — дешевле', () => {
    const plain = movementWeight(weights, { kind: 'closer' });
    const cover = movementWeight(weights, { kind: 'closer', guard: 1 });
    const exposed = movementWeight(weights, { kind: 'closer', exposed: 1 });

    expect(cover).toBeGreaterThan(plain);
    expect(exposed).toBeLessThan(plain);
    expect(exposed).toBeGreaterThanOrEqual(0);
  });

  it('перекрытие и подстава растут с величиной признака, а не срабатывают на «да/нет»', () => {
    const near = movementWeight(weights, { kind: 'closer', guard: 1 / 3 });
    const far = movementWeight(weights, { kind: 'closer', guard: 1 });
    const risky = movementWeight(weights, { kind: 'closer', exposed: 1 });
    const veryRisky = movementWeight(weights, { kind: 'closer', exposed: 3 });

    expect(far).toBeGreaterThan(near);
    expect(veryRisky).toBeLessThan(risky);
  });

  it('блокер встаёт в проход шагом «в никуда»: перекрытие предлагается, пустой шаг — нет', () => {
    // шаг без смены дистанции политики весят 0, и без `guardFloor` помощник физически не мог занять
    // коридор: клетка с приростом перекрытия получает вес, клетка в пустоту — по-прежнему 0
    expect(movementWeight(weights, { kind: 'idle', guard: 1 / 3 })).toBeGreaterThan(0);
    expect(movementWeight(weights, { kind: 'idle' })).toBe(0);
  });
});

describe('позиция: за кого платить картой', () => {
  const weights = weightsFor('trade', {});

  it('важность помощника: Амат и ворона важны, рой гарпий — нет', () => {
    expect(assistantImportance('anubis', 'amat')).toBeGreaterThanOrEqual(0.5);
    expect(assistantImportance('snow-queen', 'crow')).toBeGreaterThanOrEqual(0.5);
    expect(assistantImportance('medusa', 'harpies')).toBeLessThan(0.5);
    expect(assistantImportance('tesla', null)).toBe(0);
  });

  it('защита обычного тела с 2 hp стоит дешевле, чем защита героя', () => {
    const card = { value: 2, bonus: 1 };
    const body = defenseWeight(card, weights, {
      threat: 3,
      save: { type: 'assistant', hp: 2, important: false },
    });
    const hero = defenseWeight(card, weights, {
      threat: 3,
      save: { type: 'hero', hp: 14, important: true },
    });

    expect(body).toBeLessThan(hero);
  });

  it('важного помощника защищают дороже обычного: у него ломается механика пака', () => {
    const card = { value: 2, bonus: 1 };
    const cheap = defenseWeight(card, weights, {
      threat: 3,
      save: { type: 'assistant', hp: 2, important: false },
    });
    const key = defenseWeight(card, weights, {
      threat: 3,
      save: { type: 'assistant', hp: 2, important: true },
    });

    expect(key).toBeGreaterThan(cheap);
  });

  it('приговорённое тело картой не спасают: урон уже не меньше здоровья', () => {
    const card = { value: 3, bonus: 1 };
    const doomed = defenseWeight(card, weights, {
      threat: 6,
      save: { type: 'assistant', hp: 2, important: false },
    });
    const survivable = defenseWeight(card, weights, {
      threat: 1,
      save: { type: 'assistant', hp: 4, important: false },
    });

    expect(doomed).toBeLessThan(survivable);
  });

  it('карта в руке подсказывает землю: стихии из её правил идут в «свою землю» шага', () => {
    const cards = [
      { id: 'x_01', rules: [{ when: [{ fact: 'CELLS', params: { terrain: ['ice'] } }] }] },
      { id: 'x_02', rules: [{ then: [{ action: 'SET_CELL_TERRAIN', terrain: 'lava' }] }] },
      { id: 'x_03', rules: [{ when: [{ fact: 'FIGHTERS', params: { terrain: 'desert' } }] }] },
    ];

    expect([...handTerrains(cards)].sort()).toEqual(['desert', 'ice', 'lava']);
    expect(handTerrains([]).size).toBe(0);
  });
});

describe('телепорт, обмен и выселение', () => {
  const weights = weightsFor('trade', {});
  /** Дороти (дальность 3) на 1, Тото на 3 в узком месте, чужой герой на 5. */
  const swapState = () => {
    const state = corridorState();
    state.players[0].heroId = 'dorothy';
    state.players[0].fighters[0].attackRange = 3;
    state.players[0].skill = {
      id: 'dorothy_skill',
      rules: [{ moment: 'picked', then: [{ action: 'SWAP_FIGHTERS', a: 'dorothy', b: 'pup' }] }],
    };
    state.players[0].fighters[0].id = 'dorothy';
    state.targeting = {
      playerId: '0',
      source: 'dorothy_skill',
      kind: 'fighters',
      required: false,
      count: 1,
      picked: [],
      candidates: [{ fighterId: 'dorothy' }, { fighterId: 'pup' }],
    };
    return state;
  };

  it('перенос не считается шагом: база — «позиция не изменилась», а не топтание', () => {
    // у шага «в никуда» вес 0 (иначе бот топчется), у переноса 0 значил бы «отказ выгоднее любого ухода»
    expect(teleportWeight(weights, {})).toBe(TELEPORT_BASE);
    expect(teleportWeight(weights, { kind: 'step' })).toBeGreaterThan(
      teleportWeight(weights, { kind: 'closer' }),
    );
    expect(teleportWeight(weights, { kind: 'away' })).toBeGreaterThan(TELEPORT_BASE);
  });

  it('под удар тело не переносят: штраф снимает выгоду любой клетки', () => {
    const safe = teleportWeight(weights, { kind: 'away' });
    const risky = teleportWeight(weights, { kind: 'away', exposed: 1 });

    expect(risky).toBeLessThan(safe);
    expect(risky).toBe(0);
  });

  it('срезанный путь добавляет веса: перенос ближе цели выгоднее переноса на месте', () => {
    expect(teleportWeight(weights, { shortcut: 2 })).toBeGreaterThan(TELEPORT_BASE);
    expect(teleportWeight(weights, { shortcut: 0 })).toBe(TELEPORT_BASE);
  });

  it('обмен: цена одна на оба клика, и она растёт с приростом позиции', () => {
    const neutral = swapWeight(weights, { delta: 0 });
    const better = swapWeight(weights, { delta: 2 });
    const worse = swapWeight(weights, { delta: -2 });

    expect(neutral).toBe(weights.pick);
    expect(better).toBeGreaterThan(neutral);
    expect(worse).toBeLessThan(neutral);
    expect(worse).toBeGreaterThan(0);
  });

  it('окно обмена весит одинаково на обоих бойцах: решает «меняться ли», а не «на кого нажать»', () => {
    const options = actionsFor(swapState(), '0', { policy: 'trade', skipAllowed: true });
    const clicks = options.filter(option => option.action.kind === 'fighter');
    const skip = options.find(option => option.action.type === 'UI_OK');

    expect(clicks).toHaveLength(2);
    expect(clicks[0].weight).toBe(clicks[1].weight);
    // дальник подходит к цели переносом: Дороти на 1 не достаёт, с 3 — достаёт
    expect(clicks[0].weight).toBeGreaterThan(skip.weight);
  });

  it('отказ необязательного окна предлагается всегда, а не только в «осторожном» прогоне', () => {
    // кнопка «Завершить умение» — легальный ход: без неё бот обязан был меняться каждый ход наугад
    const options = actionsFor(swapState(), '0', { policy: 'trade' });

    expect(options.some(option => option.action.type === 'UI_OK')).toBe(true);
  });

  it('чужой перенос: врага ставят под мои удары и подальше от своего героя', () => {
    const state = corridorState({ pup: false });
    state.players[0].fighters.push(unit('mate', 'assistant', 2, 1));
    const foe = state.players[1].fighters[0];

    // клетка 2 — под двумя моими бойцами и далеко от его героя, 3 — под одним, 5 — на его стороне
    expect(banishValue(state, '0', foe, 2)).toBeGreaterThan(banishValue(state, '0', foe, 3));
    expect(banishValue(state, '0', foe, 3)).toBeGreaterThan(banishValue(state, '0', foe, 9));
    expect(banishWeight(weights, { value: 3 })).toBeGreaterThan(
      banishWeight(weights, { value: 1 }),
    );
  });

  it('клетка переноса: тело в проходе дороже безопасного угла, герой — ближе к цели', () => {
    const state = swapState();
    const dorothy = state.players[0].fighters[0];
    const body = state.players[0].fighters[1];

    expect(cellPlacementWeight(state, '0', body, 3, weights)).toBeGreaterThan(
      cellPlacementWeight(state, '0', body, 7, weights),
    );
    expect(cellPlacementWeight(state, '0', dorothy, 3, weights)).toBeGreaterThan(
      cellPlacementWeight(state, '0', dorothy, 1, weights),
    );
  });
});

/**
 * Признаки с **той стороны** (`.docs/bot-strategies.md` п. 8 и хвост «б»): теснота вокруг чужого героя,
 * перекрытие его кратчайшего пути к моему дешёвому бойцу и отход приговорённого важного помощника.
 */
describe('позиция: теснота чужого героя, его путь и отход в тыл', () => {
  /** Своя героиня на 1, помощник на 3 (в коридоре), чужой герой на 5. */
  const stateOf = () => {
    const state = corridorState();
    state.players[0].heroId = 'anubis';
    state.players[1].heroId = 'ifrit';
    return state;
  };

  it('теснота чужого героя: свободные соседние клетки считаются, занятые — нет', () => {
    const state = stateOf();
    // у героя на 5 сосед 4 и 9; сосед 9 свободен, 4 — тоже
    expect(foeRoomValue(state, '0')).toBe(2);
    // тело, вставшее на клетку 4, закрывает один выход
    expect(foeRoomValue(state, '0', 4, { skip: 'hound' })).toBe(1);
    // на клетку, которая не соседствует с героем, — не закрывает ничего
    expect(foeRoomValue(state, '0', 1, { skip: 'hound' })).toBe(2);
  });

  it('путь чужого героя к моему дешёвому бойцу: коридор перекрывается, обход — нет', () => {
    const state = stateOf();
    // мой помощник на 3, чужой герой на 5: кратчайший маршрут 5—4—3
    expect(routeBlockValue(state, '0', 4)).toBe(1);
    expect(routeBlockValue(state, '0', 9)).toBe(0);
    // без своего помощника перекрывать нечего
    state.players[0].fighters = state.players[0].fighters.filter(fighter => fighter.id !== 'pup');
    expect(routeBlockValue(state, '0', 4)).toBe(0);
  });

  it('отход в тыл растёт с отрывом и не считает шаг на месте выгодой', () => {
    const state = stateOf();
    // с клетки 2 (рядом с чужим героем) шаг на 1 — отрыв; на месте — ноль
    expect(rearValue(state, '0', 2, 1)).toBeGreaterThan(0);
    expect(rearValue(state, '0', 2, 2)).toBe(0);
    expect(rearValue(state, '0', 2, 3)).toBe(0);
  });
});

/**
 * Асимметрия обмена (`.docs/bot-strategies.md`, «Асимметрия размена»): прирост позиции **героя** весит в
 * пять раз больше прироста позиции помощника, а с `swaphero: 0` возвращается прежняя односторонняя шкала.
 */
describe('обмен: герой дороже помощника', () => {
  const weights = weightsFor('trade', {});
  const state = () => {
    const built = corridorState();
    built.players[0].heroId = 'dorothy';
    built.players[0].fighters[0].id = 'dorothy';
    built.players[0].fighters[0].attackRange = 3;
    return built;
  };

  it('герой ×2,5, помощник ×0,5 — и это ровно разница с прежней шкалой', () => {
    const built = state();
    const dorothy = built.players[0].fighters[0];
    const pup = built.players[0].fighters[1];
    const placed = (fighter, cell) => cellPlacementWeight(built, '0', fighter, cell, weights);
    // Дороти уходит из коридора на 1, Тото встаёт в коридор на 3
    const heroDelta = placed(dorothy, 3) - placed(dorothy, 1);
    const bodyDelta = placed(pup, 1) - placed(pup, 3);

    const symmetric = swapDelta(built, '0', { ...weights, swaphero: 0 }, [dorothy, pup]);
    const asymmetric = swapDelta(built, '0', weights, [dorothy, pup]);

    expect(symmetric).toBeCloseTo(heroDelta + bodyDelta, 6);
    expect(asymmetric).toBeCloseTo(SWAP_HERO * heroDelta + SWAP_BODY * bodyDelta, 6);
  });
});
