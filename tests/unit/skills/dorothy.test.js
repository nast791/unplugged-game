import { describe, expect, it } from 'vitest';
import { runAction, runLifecycle, runUi } from '#shared/publicApi.js';
import dorothy from '../../../server/content/heroes/dorothy/index.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

/**
 * Линия 1—2—3—4—5—6, лёд: Дороти на 1, Тото на 4 — собака стоит дальше её хода (move 2),
 * но в одной с ней области.
 */
const lineMap = {
  id: 'line',
  nodes: [1, 2, 3, 4, 5, 6].map(id => ({
    id,
    neighbors: [id - 1, id + 1].filter(neighbor => neighbor >= 1 && neighbor <= 6),
    terrain: 'ice',
  })),
};

/** Стык зон: 1—2 лёд, 3—4 лава — Тото в двух шагах, но уже в другой области. */
const mixedMap = {
  id: 'mixed',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'lava' },
    { id: 4, neighbors: [3], terrain: 'lava' },
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

/** Дороти (игрок 0) со способностью, Тото на `totoCell`; `skill: null` — герой без способности. */
const buildState = ({ totoCell = 4, map = lineMap, foeCell = 6, skill = dorothy.skill } = {}) =>
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

/** Тото убит: боец уходит с поля в `lost` игрока. */
const withDeadToto = () => {
  const state = buildState();
  player(state, '0').fighters = player(state, '0').fighters.filter(entry => entry.id !== 'toto');
  player(state, '0').lost = [{ ...unit('toto', null, 0, { type: 'assistant', group: 'toto' }) }];
  return state;
};

/** Ход закончился: хук turnEnd, действий не осталось — здесь и входит способность. */
const endTurn = state => {
  state.hook = PHASES.turnEnd;
  return runLifecycle(state);
};

const positionOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId).currentPosition;

const clickFighter = (state, id) =>
  runAction(state, { type: 'PICK', kind: 'fighter', id, playerId: '0' });

const skip = state => runAction(state, { type: 'UI_OK', playerId: '0' });

describe('способность Дороти (Серебряные башмачки)', () => {
  it('описана по контракту: конец хода и отметка цели, без партнёра и вариантов', () => {
    expect(dorothy.skill.type).toBe('skill');
    expect(dorothy.skill.fighter).toBe('dorothy');
    expect(dorothy.skill.title).toBe('Серебряные башмачки');
    expect(dorothy.skill.text).toContain('КОНЕЦ ХОДА');
    expect(dorothy.skill.text).toContain('кликните по любому из них');
    expect(dorothy.skill.text).toContain('меняются местами');
    expect(dorothy.skill.rules.map(rule => rule.moment)).toEqual(['turnEnd', 'picked']);
    // обмен — не шаг манёвра: партнёра способность не объявляет
    expect(dorothy.skill.swapWith).toBeUndefined();
    expect(dorothy.skill.options).toBeUndefined();
  });

  it('герой и помощник описаны по паспорту: 12/2 ближний и Тото 6/3 ближний', () => {
    expect(dorothy.heroes[0]).toMatchObject({
      id: 'dorothy',
      hp: 12,
      move: 2,
      attackRange: 1,
    });
    expect(dorothy.assistants[0]).toMatchObject({ id: 'toto', hp: 6, move: 3, attackRange: 1 });
    expect(dorothy.items).toEqual([]);
  });

  it('в конце хода подсвечивает обоих и ждёт клика: ход не закрывается сам', () => {
    const state = endTurn(buildState());
    const ui = runUi(state, '0');

    expect(state.hook).toBe(PHASES.turnEnd);
    expect(state.targeting).toMatchObject({
      playerId: '0',
      source: 'dorothy_skill',
      kind: 'fighters',
      count: 1,
      required: false,
    });
    expect(state.targeting.candidates.map(entry => entry.fighterId)).toEqual(['dorothy', 'toto']);

    expect(ui.phase).toBe('choose');
    expect(ui.highlightedFighterIds).toEqual(['dorothy', 'toto']);
    expect(ui.pickFighters).toBe(true);
    // сверху — текст способности: он и говорит, что кликать
    expect(ui.hint).toContain('КОНЕЦ ХОДА');
    expect(ui.controls.ok).toEqual({ visible: true, enabled: true, label: 'Завершить умение' });

    // автоматики нет: без клика бойцы остались на местах
    expect(positionOf(state, '0', 'dorothy')).toBe(1);
    expect(positionOf(state, '0', 'toto')).toBe(4);
  });

  it('обмен симметричный: клик по Дороти и клик по Тото дают одно и то же', () => {
    for (const fighterId of ['dorothy', 'toto']) {
      const after = clickFighter(endTurn(buildState()), fighterId);

      expect(positionOf(after, '0', 'dorothy')).toBe(4);
      expect(positionOf(after, '0', 'toto')).toBe(1);
      expect(after.targeting ?? null).toBeNull();
      // ход закрылся, партия ушла следующему игроку
      expect(after.hook).toBe(PHASES.turn);
      expect(after.turn.playerId).toBe('1');
    }
  });

  it('отказ общей кнопкой оставляет бойцов на местах и передаёт ход', () => {
    const state = endTurn(buildState());

    const after = skip(state);

    expect(positionOf(after, '0', 'dorothy')).toBe(1);
    expect(positionOf(after, '0', 'toto')).toBe(4);
    expect(after.targeting ?? null).toBeNull();
    expect(after.turn.playerId).toBe('1');
  });

  it('разные области — окна нет, ход закрывается сразу', () => {
    const state = endTurn(buildState({ map: mixedMap, totoCell: 3, foeCell: 4 }));

    expect(state.targeting ?? null).toBeNull();
    expect(state.hook).toBe(PHASES.turn);
    expect(state.turn.playerId).toBe('1');
    expect(positionOf(state, '0', 'toto')).toBe(3);
  });

  it('Тото убит — меняться некем, окна нет', () => {
    const state = withDeadToto();
    expect(player(state, '0').lost.map(entry => entry.id)).toEqual(['toto']);

    const after = endTurn(state);

    expect(after.targeting ?? null).toBeNull();
    expect(positionOf(after, '0', 'dorothy')).toBe(1);
    expect(after.turn.playerId).toBe('1');
  });

  it('у героя нет правил конца хода — способность молчит', () => {
    const noRules = { id: 'dorothy_skill', type: 'skill', fighter: 'dorothy' };

    const after = endTurn(buildState({ skill: noRules }));

    expect(after.targeting ?? null).toBeNull();
    expect(after.turn.playerId).toBe('1');
  });
});
