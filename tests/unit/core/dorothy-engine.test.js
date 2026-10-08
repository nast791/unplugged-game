import { describe, expect, it } from 'vitest';
import { SET_FIGHTER_CELL } from '#shared/actions/fighter.js';
import { SET_MOVEMENT } from '#shared/actions/movement.js';
import { SWAP_FIGHTERS } from '#shared/actions/swap.js';
import { runFact } from '#shared/facts/run.js';
import { runAction, runLifecycle, runUi } from '#shared/publicApi.js';
import dorothy from '../../../server/content/heroes/dorothy/index.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

/** Области: 1—2 лёд, 3 лава. */
const areaMap = {
  id: 'areas',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2], terrain: 'lava' },
  ],
};

const zone = cards => ({ visibility: [], cards });

const unit = (id, cell, hp, extra = {}) => ({
  ...fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 2,
    attackRange: 1,
  }),
  startHp: hp,
  ...extra,
});

const slot = (id, name, order, fighters) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone([]),
  discard: zone([]),
  fighters,
});

/** Дороти и Тото в одной области (лёд), Бета — на лаве. */
const pairState = () =>
  createState({
    phase: PHASES.turn,
    map: areaMap,
    players: [
      slot('0', 'Дороти', 1, [
        unit('dorothy', 1, 12),
        unit('toto', 2, 6, { type: 'assistant', group: 'toto' }),
      ]),
      slot('1', 'Бета', 2, [unit('beta', 3, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('SWAP_FIGHTERS', () => {
  it('меняет бойцов клетками, порядок аргументов не важен', () => {
    const state = createState();

    SWAP_FIGHTERS(state, { a: 'alpha', b: 'pawn' });

    expect(fighterOf(state, '0', 'alpha').currentPosition).toBe(9);
    expect(fighterOf(state, '0', 'pawn').currentPosition).toBe(8);
  });

  it('идемпотентен как обмен: два вызова возвращают исходные клетки', () => {
    const state = createState();

    SWAP_FIGHTERS(state, { a: 'pawn', b: 'alpha' });
    expect(fighterOf(state, '0', 'alpha').currentPosition).toBe(9);
    expect(fighterOf(state, '0', 'pawn').currentPosition).toBe(8);

    SWAP_FIGHTERS(state, { a: 'alpha', b: 'pawn' });
    expect(fighterOf(state, '0', 'alpha').currentPosition).toBe(8);
    expect(fighterOf(state, '0', 'pawn').currentPosition).toBe(9);
  });

  it('отклоняет неполные параметры и одного бойца дважды', () => {
    const state = createState();

    expect(() => SWAP_FIGHTERS(state, { a: 'alpha' })).toThrow(/нужны a и b/);
    expect(() => SWAP_FIGHTERS(state, {})).toThrow(/нужны a и b/);
    expect(() => SWAP_FIGHTERS(state, { a: 'alpha', b: 'alpha' })).toThrow(/два разных/);
  });

  it('отклоняет отсутствующего и нерасставленного бойца', () => {
    const state = createState();

    expect(() => SWAP_FIGHTERS(state, { a: 'alpha', b: 'nope' })).toThrow(/не найден/);

    fighterOf(state, '0', 'pawn').currentPosition = null;
    expect(() => SWAP_FIGHTERS(state, { a: 'alpha', b: 'pawn' })).toThrow(/на поле/);
    // состояние не поменялось: обмена не было
    expect(fighterOf(state, '0', 'alpha').currentPosition).toBe(8);
  });
});

describe('факт FIGHTERS: max', () => {
  it('max: 0 читается как «никого»: пустой список подходит, непустой — нет', () => {
    const state = pairState();
    const params = { fighterIds: ['dorothy'], areaOf: 'toto', max: 0 };

    // Дороти и Тото на льду: Дороти попадает в область собаки
    expect(runFact(state, 'FIGHTERS', params, { playerId: '0' })).toEqual({
      ok: false,
      value: [expect.objectContaining({ fighterId: 'dorothy' })],
    });

    // Дороти ушла на лаву: в области Тото пусто, условие «никого» сошлось
    SET_FIGHTER_CELL(state, { fighterId: 'dorothy', cellId: 3 });
    expect(runFact(state, 'FIGHTERS', params, { playerId: '0' })).toEqual({ ok: true, value: [] });
  });

  it('min и max работают вместе: пустой список не проходит min: 1', () => {
    const state = pairState();
    SET_FIGHTER_CELL(state, { fighterId: 'dorothy', cellId: 3 });
    const params = { fighterIds: ['dorothy'], areaOf: 'toto' };

    expect(runFact(state, 'FIGHTERS', { ...params, min: 1 }, { playerId: '0' }).ok).toBe(false);
    expect(runFact(state, 'FIGHTERS', { ...params, max: 0 }, { playerId: '0' }).ok).toBe(true);
    expect(runFact(state, 'FIGHTERS', { ...params, max: 1 }, { playerId: '0' }).ok).toBe(true);
  });

  it('значения фактов в параметрах: fighterIds принимает и объекты, и одноэлементный список', () => {
    const state = pairState();
    const heroes = runFact(
      state,
      'FIGHTERS',
      { side: 'self', type: 'hero', min: 1 },
      { playerId: '0' },
    ).value;

    // список объектов из FIGHTERS — то, что правило подставляет в `$переменную`
    expect(runFact(state, 'FIGHTERS', { fighterIds: heroes, min: 1 }, { playerId: '0' })).toEqual({
      ok: true,
      value: [expect.objectContaining({ fighterId: 'dorothy' })],
    });
    // и одиночный объект факта, и обычная строка читаются так же
    expect(
      runFact(
        state,
        'FIGHTERS',
        { fighterIds: { fighterId: 'dorothy' }, min: 1 },
        { playerId: '0' },
      ).ok,
    ).toBe(true);
    expect(runFact(state, 'FIGHTERS', { fighterIds: 'toto', min: 1 }, { playerId: '0' }).ok).toBe(
      true,
    );
  });
});

describe('флаг movedThisTurn', () => {
  it('SET_FIGHTER_CELL ставит флаг на шаге по полю', () => {
    const state = createState();
    expect(fighterOf(state, '0', 'alpha').movedThisTurn).toBeUndefined();

    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 });

    expect(fighterOf(state, '0', 'alpha').movedThisTurn).toBe(true);
    expect(
      runFact(
        state,
        'FIGHTERS',
        { fighterIds: ['alpha'], movedThisTurn: true, min: 1 },
        { playerId: '0' },
      ).ok,
    ).toBe(true);
    // условие карты читается с min: 1 — двигавшегося бойца в списке нет
    expect(
      runFact(
        state,
        'FIGHTERS',
        { fighterIds: ['alpha'], movedThisTurn: false, min: 1 },
        { playerId: '0' },
      ).ok,
    ).toBe(false);
  });

  it('расстановка (start: true) и шаг на ту же клетку флаг не ставят', () => {
    const state = createState();

    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 10, start: true });
    expect(fighterOf(state, '0', 'alpha').startPosition).toBe(10);
    expect(fighterOf(state, '0', 'alpha').movedThisTurn).toBeUndefined();

    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 10 });
    expect(fighterOf(state, '0', 'alpha').movedThisTurn).toBeUndefined();
  });

  it('шаг черновика перемещения (SET_MOVEMENT step) тоже ставит флаг', () => {
    const state = createState();
    // убираем помощника, чтобы клетка 9 была свободной
    player(state, '0').fighters = [fighterOf(state, '0', 'alpha')];

    SET_MOVEMENT(state, { op: 'open', playerId: '0' });
    SET_MOVEMENT(state, { op: 'step', playerId: '0', fighterId: 'alpha', cellId: 9 });

    expect(fighterOf(state, '0', 'alpha').currentPosition).toBe(9);
    expect(fighterOf(state, '0', 'alpha').movedThisTurn).toBe(true);
  });

  it('начало хода снимает флаг у всех бойцов', () => {
    const state = createState();
    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 });
    expect(fighterOf(state, '0', 'alpha').movedThisTurn).toBe(true);

    state.hook = PHASES.turnStart;
    const after = runLifecycle(state);

    expect(after.hook).toBe(PHASES.turn);
    expect(fighterOf(after, '0', 'alpha').movedThisTurn).toBe(false);
    expect(
      runFact(
        after,
        'FIGHTERS',
        { fighterIds: ['alpha'], movedThisTurn: false, min: 1 },
        { playerId: '0' },
      ).ok,
    ).toBe(true);
  });
});

describe('способность конца хода: окно без вариантов', () => {
  /** Линия 1—2—3—4—5, лёд: Тото может стоять дальше хода Дороти (move 2). */
  const lineMap = {
    id: 'line',
    nodes: [1, 2, 3, 4, 5].map(id => ({
      id,
      neighbors: [id - 1, id + 1].filter(neighbor => neighbor >= 1 && neighbor <= 5),
      terrain: 'ice',
    })),
  };

  /** Стык зон: 1—2 лёд, 3—4 лава. */
  const mixedMap = {
    id: 'mixed',
    nodes: [
      { id: 1, neighbors: [2], terrain: 'ice' },
      { id: 2, neighbors: [1, 3], terrain: 'ice' },
      { id: 3, neighbors: [2, 4], terrain: 'lava' },
      { id: 4, neighbors: [3], terrain: 'lava' },
    ],
  };

  /** Дороти (игрок 0) со способностью, Тото и Бета; `skill` без правил — герой без способности. */
  const swapState = ({ totoCell = 4, map = lineMap, foeCell = 5, skill = dorothy.skill } = {}) =>
    createState({
      phase: PHASES.turn,
      actionsLeft: 0,
      map,
      players: [
        {
          ...slot('0', 'Дороти', 1, [
            unit('dorothy', 1, 12),
            unit('toto', totoCell, 6, { type: 'assistant', group: 'toto' }),
          ]),
          skill,
        },
        slot('1', 'Бета', 2, [unit('beta', foeCell, 13)]),
      ],
      turn: { index: 1, playerId: '0', actedRound: ['0'] },
      _enteredHooks: { gameStart: true, turn: true },
    });

  /** Ход закончился: вход в turnEnd сам прогоняет правила способности. */
  const endTurn = state => {
    state.hook = PHASES.turnEnd;
    return runLifecycle(state);
  };

  it('вход в turnEnd открывает окно и держит ход: без клика бойцы не меняются', () => {
    const state = endTurn(swapState());

    expect(state.hook).toBe(PHASES.turnEnd);
    expect(state.targeting).toMatchObject({
      playerId: '0',
      source: 'dorothy_skill',
      kind: 'fighters',
      count: 1,
      required: false,
    });
    // выбора «без выбора» нет: autoPick не включён, отметку делает игрок
    expect(state.targeting.auto).toBe(false);
    expect(state.targeting.candidates).toEqual([
      expect.objectContaining({ fighterId: 'dorothy', playerId: '0' }),
      expect.objectContaining({ fighterId: 'toto', playerId: '0' }),
    ]);
    expect(fighterOf(state, '0', 'dorothy').currentPosition).toBe(1);
    expect(fighterOf(state, '0', 'toto').currentPosition).toBe(4);
  });

  it('окно принадлежит владельцу способности: чужой вью подсветки не видит', () => {
    const state = endTurn(swapState());

    const mine = runUi(state, '0');
    expect(mine.highlightedFighterIds).toEqual(['dorothy', 'toto']);
    expect(mine.hint).toContain('КОНЕЦ ХОДА');

    const foreign = runUi(state, '1');
    expect(foreign.phase ?? null).toBeNull();
    expect(foreign.highlightedFighterIds).toBeUndefined();
    expect(foreign.hint ?? null).toBeNull();
  });

  it('повторный прогон хука окно не переоткрывает', () => {
    const state = endTurn(swapState());

    const again = runLifecycle(state);

    expect(again.targeting).not.toBeNull();
    expect(fighterOf(again, '0', 'toto').currentPosition).toBe(4);
  });

  it('отметка цели меняет бойцов и закрывает окно ровно один раз', () => {
    const state = endTurn(swapState());

    const after = runAction(state, { type: 'PICK', kind: 'fighter', id: 'toto', playerId: '0' });

    expect(fighterOf(after, '0', 'dorothy').currentPosition).toBe(4);
    expect(fighterOf(after, '0', 'toto').currentPosition).toBe(1);
    expect(after.targeting ?? null).toBeNull();
    expect(after.hook).toBe(PHASES.turn);
    expect(after.turn.playerId).toBe('1');
  });

  it('отказ общей кнопкой закрывает окно без обмена', () => {
    const state = endTurn(swapState());
    expect(runUi(state, '0').controls.ok).toEqual({
      visible: true,
      enabled: true,
      label: 'Завершить умение',
    });

    const after = runAction(state, { type: 'UI_OK', playerId: '0' });

    expect(fighterOf(after, '0', 'dorothy').currentPosition).toBe(1);
    expect(fighterOf(after, '0', 'toto').currentPosition).toBe(4);
    expect(after.targeting ?? null).toBeNull();
    expect(after.turn.playerId).toBe('1');
  });

  it('разные области, убитый Тото и способность без правил — окна нет', () => {
    // Тото на лаве, Дороти на льду — области разные
    const apart = endTurn(swapState({ map: mixedMap, totoCell: 3, foeCell: 4 }));
    expect(apart.targeting ?? null).toBeNull();
    expect(apart.turn.playerId).toBe('1');

    // Тото убит и лежит в `lost`
    const dead = swapState();
    player(dead, '0').fighters = player(dead, '0').fighters.filter(entry => entry.id !== 'toto');
    player(dead, '0').lost = [unit('toto', null, 0, { type: 'assistant', group: 'toto' })];
    const afterDead = endTurn(dead);
    expect(afterDead.targeting ?? null).toBeNull();
    expect(afterDead.turn.playerId).toBe('1');

    // у героя нет правил конца хода
    const noRules = swapState({
      skill: { id: 'dorothy_skill', type: 'skill', fighter: 'dorothy' },
    });
    expect(endTurn(noRules).targeting ?? null).toBeNull();
  });
});
