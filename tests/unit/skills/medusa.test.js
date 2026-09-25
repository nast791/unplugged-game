import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runUi } from '#shared/core.js';
import { runAction, runLifecycle } from '#shared/gameEngine.js';
import medusa from '../../../server/content/heroes/medusa/index.js';
import { ap, createState, fighter, PHASES, player } from '../../fixtures/state.js';

/** Области: 1-3 синие (зона Медузы), 4 красная. */
const areaMap = {
  id: 'areas',
  nodes: [
    { id: 1, neighbors: [2], areas: ['#blue'] },
    { id: 2, neighbors: [1, 3], areas: ['#blue'] },
    { id: 3, neighbors: [2, 4], areas: ['#blue'] },
    { id: 4, neighbors: [3], areas: ['#red'] },
  ],
};

const hero = (id, cell) =>
  fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: 10,
    move: 2,
    attackRange: 1,
  });

const slot = (id, name, order, fighters) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: { visibility: [], cards: [] },
  hand: { visibility: [], cards: [] },
  discard: { visibility: [], cards: [] },
  fighters,
});

/** Ход Медузы (игрок 0) с настоящим скиллом из контента. */
const skillState = ({ enemyCell = 3, enemyHp = 10 } = {}) => {
  const state = createState({
    phase: PHASES.turn,
    map: areaMap,
    players: [
      {
        ...slot('0', 'Медуза', 1, [
          hero('medusa', 1),
          fighter({
            id: 'harpies',
            name: 'Гарпии',
            type: 'assistant',
            currentPosition: 2,
            currentHp: 1,
            move: 3,
            attackRange: 1,
          }),
        ]),
        skill: medusa.skill,
      },
      slot('1', 'Beta', 2, [hero('beta', enemyCell)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
  });

  player(state, '1').fighters[0].currentHp = enemyHp;
  return state;
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('способность Медузы (Взгляд Медузы)', () => {
  it('контент использует только известные моменты', () => {
    for (const rule of medusa.skill.rules) {
      expect(isMoment(rule.moment)).toBe(true);
    }
  });

  it('скилл описан по контракту: type, fighter, title, text, rules', () => {
    expect(medusa.skill.type).toBe('skill');
    expect(medusa.skill.fighter).toBe('medusa');
    expect(medusa.skill.title).toBe('Взгляд Медузы');
    expect(medusa.skill.text).toContain('1 урон');
    expect(Array.isArray(medusa.skill.rules)).toBe(true);
  });

  it('в начале хода предлагает врагов только в области Медузы', () => {
    const state = runLifecycle(skillState());

    expect(state.targeting).toEqual({
      playerId: '0',
      source: 'medusa_skill',
      required: false,
      count: 1,
      candidates: [
        { fighterId: 'beta', playerId: '1', name: 'beta', position: 3 },
      ],
      picked: null,
    });

    const ui = runUi(state, '0');
    expect(ui.phase).toBe('choose');
    expect(ui.highlightedFighterIds).toEqual(['beta']);
    expect(ui.hint).toBe(medusa.skill.text);

    // чужому игроку кандидатов не видно
    expect(runUi(state, '1').highlightedFighterIds).toEqual([]);
  });

  it('клик по подсвеченному бойцу наносит ровно 1 урон и закрывает окно', () => {
    let state = runLifecycle(skillState());

    state = runAction(state, {
      type: 'PICK',
      kind: 'fighter',
      id: 'beta',
      playerId: '0',
    });

    expect(fighterOf(state, '1', 'beta').currentHp).toBe(9);
    expect(fighterOf(state, '0', 'harpies').currentHp).toBe(1);
    expect(state.targeting).toBeNull();
    expect(ap(state)).toBe(2);
    expect(state.hook).toBe(PHASES.turn);
  });

  it('клик по своему бойцу (не кандидату) отклоняется', () => {
    const state = runLifecycle(skillState());

    expect(() =>
      runAction(state, {
        type: 'PICK',
        kind: 'fighter',
        id: 'harpies',
        playerId: '0',
      }),
    ).toThrow(/не среди кандидатов/);
  });

  it('враг вне области Медузы — окно не открывается', () => {
    const state = runLifecycle(skillState({ enemyCell: 4 }));

    expect(state.targeting).toBeNull();
    expect(runUi(state, '0').highlightedFighterIds).toEqual([]);
    expect(runUi(state, '0').hint).not.toBe(medusa.skill.text);
    expect(() =>
      runAction(state, {
        type: 'PICK',
        kind: 'fighter',
        id: 'beta',
        playerId: '0',
      }),
    ).toThrow(/некого/);
  });

  it('способность необязательна: объявление действия закрывает окно и не возвращает его', () => {
    let state = runLifecycle(skillState());
    expect(state.targeting).not.toBeNull();

    state = runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' });
    expect(state.targeting).toBeNull();
    expect(state.movement).not.toBeNull();

    state = runAction(state, { type: 'UI_OK', playerId: '0' });
    expect(state.movement).toBeNull();
    expect(state.targeting).toBeNull();
    expect(fighterOf(state, '1', 'beta').currentHp).toBe(10);

    expect(() =>
      runAction(state, {
        type: 'PICK',
        kind: 'fighter',
        id: 'beta',
        playerId: '0',
      }),
    ).toThrow(/некого/);
  });

  it('добивающий урон способностью завершает партию', () => {
    let state = runLifecycle(skillState({ enemyHp: 1 }));

    state = runAction(state, {
      type: 'PICK',
      kind: 'fighter',
      id: 'beta',
      playerId: '0',
    });

    expect(state.hook).toBe(PHASES.gameEnd);
    expect(state.winner).toBe('0');
    expect(player(state, '1').fighters).toHaveLength(0);
  });

  it('без Медузы на поле способность не предлагается', () => {
    const state = skillState();
    fighterOf(state, '0', 'medusa').currentPosition = null;

    const started = runLifecycle(state);

    expect(started.targeting).toBeNull();
    expect(runUi(started, '0').highlightedFighterIds).toEqual([]);
  });
});
