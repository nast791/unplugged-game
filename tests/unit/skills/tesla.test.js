import { describe, expect, it } from 'vitest';
import { SET_ITEM } from '#shared/actions/items.js';
import { isMoment } from '#shared/constants/moments.js';
import { runFact } from '#shared/facts/run.js';
import { runAction, runLifecycle } from '#shared/publicApi.js';
import { movableFighterIds, movementDestinations } from '#shared/helpers/turn.js';
import { buildPlayer } from '../../../server/builders.js';
import tesla from '../../../server/content/heroes/tesla/index.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const coils = (state, playerId = '0') =>
  player(state, playerId).items.filter(item => item.group === 'coil');

const coilStates = (state, playerId = '0') => coils(state, playerId).map(item => item.state);

/** Линия 1—2—3—4: Тесла на 2, враг на 3 (соседняя клетка). */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3], terrain: 'ice' },
  ],
};

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
  ...extra,
});

const slot = (id, name, order, fighters, items = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: { visibility: [], cards: [] },
  hand: { visibility: [], cards: [] },
  discard: { visibility: [], cards: [] },
  fighters,
  items,
});

/**
 * Партия Теслы (игрок 0) против Беты (игрок 1).
 * `coils` — состояния катушек, `foeCell` — где стоит враг.
 */
const teslaState = ({ coilStates: states = ['inactive', 'inactive'], foeCell = 3 } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Тесла',
        1,
        [unit('tesla', 2, 14, { attackRange: 3 })],
        states.map((state, index) => ({
          id: `coil_${index + 1}`,
          group: 'coil',
          name: 'Катушка Теслы',
          copies: 2,
          state,
        })),
      ),
      slot('1', 'Бета', 2, [unit('beta', foeCell, 13, { attackRange: 3 })]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    // в хук turn ещё не входили: правила способности момента turnStart прогоняет turn.enter
    _enteredHooks: { gameStart: true },
  });

const withSkill = (state, playerId = '0') => {
  player(state, playerId).skill = tesla.skill;
  return state;
};

describe('Никола Тесла: пак и катушки', () => {
  it('герой описан по карте: 14 здоровья, дальность 3, перемещение 2, без помощников', () => {
    const hero = tesla.heroes[0];
    expect(tesla.assistants).toEqual([]);
    expect(hero.hp).toBe(14);
    expect(hero.move).toBe(2);
    // дальность задаёт attackRange: признака attackType в игре нет
    expect(hero.attackRange).toBe(3);
    expect(hero.attackType).toBeUndefined();
    expect(tesla.items).toHaveLength(1);
    expect(tesla.items[0]).toMatchObject({
      id: 'coil',
      count: 2,
      state: 'inactive',
    });
  });

  it('способность описана по контракту, моменты — из списка', () => {
    expect(tesla.skill.type).toBe('skill');
    expect(tesla.skill.fighter).toBe('tesla');
    expect(tesla.skill.title).toBe('Мастерство катушек');
    expect(tesla.skill.rules.map(rule => rule.moment)).toEqual([
      'gameStart',
      'turnEnd',
      'turnStart',
      'turnStart',
    ]);
    for (const rule of tesla.skill.rules) expect(isMoment(rule.moment)).toBe(true);
  });

  it('пак собирает предметы копиями, как помощников: свой id и общая группа', () => {
    const built = buildPlayer(
      { heroId: 'tesla', order: 1, control: 'human' },
      tesla,
      0,
      {},
      () => 0.5,
    );

    expect(built.items.map(item => item.id)).toEqual(['coil_1', 'coil_2']);
    expect(built.items.map(item => item.group)).toEqual(['coil', 'coil']);
    expect(built.items.map(item => item.state)).toEqual(['inactive', 'inactive']);
    expect(built.items[0].name).toBe('Катушка Теслы');
  });

  it('в начале игры активируется ровно одна катушка', () => {
    const state = withSkill(teslaState());
    state.hook = PHASES.gameStart;
    state._enteredHooks = {};

    const after = runLifecycle(state);

    expect(coilStates(after).filter(value => value === 'active')).toHaveLength(1);
  });

  it('в конце хода заряжается одна катушка, а при полных — правило пропускается', () => {
    const state = withSkill(teslaState({ coilStates: ['active', 'inactive'] }));
    state.hook = PHASES.turnEnd;
    state._enteredHooks = { gameStart: true, turn: true };

    const after = runLifecycle(state);
    expect(coilStates(after)).toEqual(['active', 'active']);

    // обе активны: заряжать нечего, ход заканчивается без ошибки
    const full = withSkill(teslaState({ coilStates: ['active', 'active'] }));
    full.hook = PHASES.turnEnd;
    full._enteredHooks = { gameStart: true, turn: true };

    const afterFull = runLifecycle(full);
    expect(coilStates(afterFull)).toEqual(['active', 'active']);
  });

  it('факт ITEMS читает состояния, экшен SET_ITEM их переводит', () => {
    const state = teslaState({ coilStates: ['active', 'inactive'] });

    expect(
      runFact(state, 'ITEMS', { group: 'coil', state: 'active', min: 2 }, { playerId: '0' }).ok,
    ).toBe(false);
    expect(
      runFact(state, 'ITEMS', { group: 'coil', state: 'inactive' }, { playerId: '0' }).value.map(
        entry => entry.itemId,
      ),
    ).toEqual(['coil_2']);

    SET_ITEM(state, {
      playerId: '0',
      group: 'coil',
      from: 'inactive',
      to: 'active',
      count: 1,
    });
    expect(coilStates(state)).toEqual(['active', 'active']);
    expect(
      runFact(state, 'ITEMS', { group: 'coil', state: 'active', min: 2 }, { playerId: '0' }).ok,
    ).toBe(true);

    // перевести нечего — ошибка, а не молчание
    expect(() =>
      SET_ITEM(state, {
        playerId: '0',
        group: 'coil',
        from: 'inactive',
        to: 'active',
      }),
    ).toThrow(/нет предметов/);
    expect(() => SET_ITEM(state, { playerId: '0', group: 'coil' })).toThrow(/to/);
  });
});

describe('Никола Тесла: перенапряжение', () => {
  const chargedWithFoe = () => withSkill(teslaState({ coilStates: ['active', 'active'] }));

  it('при двух активных катушках наносит урон соседнему врагу и открывает толчок', () => {
    const state = chargedWithFoe();

    const after = runLifecycle(state);

    // 1 урон врагу на соседней клетке
    expect(player(after, '1').fighters[0].currentHp).toBe(12);
    // и черновик перемещения: двигает Тесла, но бойцов — вражеских
    expect(after.movement.playerId).toBe('0');
    expect(after.movement.budget).toBe(1);
    expect(after.movement.fighters).toEqual(['beta']);
    expect(movableFighterIds(after, '0')).toEqual(['beta']);
    // клетка 2 занята самой Теслой, толкнуть можно только на 4
    expect(movementDestinations(after, '0', 'beta')).toEqual(['4']);
  });

  it('Тесла сам толкает врага на одну клетку и заканчивает эффект', () => {
    const pushed = runAction(runLifecycle(chargedWithFoe()), {
      type: 'PICK',
      kind: 'cell',
      id: 4,
      fighterId: 'beta',
      playerId: '0',
    });

    expect(player(pushed, '1').fighters[0].currentPosition).toBe(4);
    expect(pushed.movement.moves).toEqual([{ fighterId: 'beta', from: 3, to: 4 }]);

    const finished = runAction(pushed, { type: 'UI_OK', playerId: '0' });
    expect(finished.movement).toBeNull();
  });

  it('Тесла может никого не толкать: до 1 клетки включает 0', () => {
    const state = runLifecycle(chargedWithFoe());

    const finished = runAction(state, { type: 'UI_OK', playerId: '0' });

    expect(finished.movement).toBeNull();
    expect(player(finished, '1').fighters[0].currentPosition).toBe(3);
  });

  it('с одной катушкой перенапряжения нет: ни урона, ни толчка', () => {
    const state = withSkill(teslaState({ coilStates: ['active', 'inactive'] }));

    const after = runLifecycle(state);

    expect(player(after, '1').fighters[0].currentHp).toBe(13);
    expect(after.movement ?? null).toBeNull();
  });

  it('враг не на соседней клетке — перенапряжения нет', () => {
    const state = withSkill(teslaState({ coilStates: ['active', 'active'], foeCell: 4 }));

    const after = runLifecycle(state);

    expect(player(after, '1').fighters[0].currentHp).toBe(13);
    expect(after.movement ?? null).toBeNull();
  });

  it('бьёт по всем врагам рядом: у каждого противника свой боец', () => {
    const state = createState({
      phase: PHASES.turn,
      map: lineMap,
      players: [
        slot(
          '0',
          'Тесла',
          1,
          [unit('tesla', 2, 14, { attackRange: 3 })],
          ['active', 'active'].map((value, index) => ({
            id: `coil_${index + 1}`,
            group: 'coil',
            name: 'Катушка Теслы',
            copies: 2,
            state: value,
          })),
        ),
        slot('1', 'Бета', 2, [unit('beta', 3, 13, { attackRange: 3 })]),
        slot('2', 'Гамма', 3, [unit('gamma', 1, 9, { attackRange: 3 })]),
      ],
      turn: { index: 1, playerId: '0', actedRound: ['0'] },
      _enteredHooks: { gameStart: true },
    });

    const after = runLifecycle(withSkill(state));

    expect(player(after, '1').fighters[0].currentHp).toBe(12);
    expect(player(after, '2').fighters[0].currentHp).toBe(8);
    expect(after.movement.fighters.sort()).toEqual(['beta', 'gamma']);
    expect(movableFighterIds(after, '0').sort()).toEqual(['beta', 'gamma']);
  });
});
