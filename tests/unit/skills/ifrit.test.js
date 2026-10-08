import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runUi } from '#shared/core.js';
import { runAction, runLifecycle } from '#shared/publicApi.js';
import ifrit from '../../../server/content/heroes/ifrit/index.js';
import { ap, createState, fighter, PHASES, player } from '../../fixtures/state.js';

/** Линия 1—3 (лёд), 4 (лава): духи ходят на 3, ифрит стоит в стороне. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
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

/** Пепельные духи: те же id, что даёт сборка партии (`builders.js` → `ash_1..ash_3`). */
const spiritsAt = (ids = ['ash_1', 'ash_2', 'ash_3'], cell = 4) =>
  ids.map(id => unit(id, cell, 1, { type: 'assistant', group: 'ash', move: 3 }));

/** Ход ифрита (игрок 0) с настоящим умением из контента; `spirits` — id живых духов. */
const skillState = ({
  spirits = ['ash_1', 'ash_2', 'ash_3'],
  actionsTotal = 2,
  actionsLeft = 2,
  skill = ifrit.skill,
} = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      {
        ...{
          id: '0',
          name: 'Ифрит',
          order: 1,
          placementReady: true,
          deck: zone([]),
          hand: zone([]),
          discard: zone([]),
          fighters: [unit('ifrit', 1, 14, { move: 2, attackRange: 3 }), ...spiritsAt(spirits)],
        },
        skill,
      },
      {
        id: '1',
        name: 'Бета',
        order: 2,
        placementReady: true,
        deck: zone([]),
        hand: zone([]),
        discard: zone([]),
        fighters: [unit('beta', 3, 13)],
      },
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsTotal, actionsLeft },
  });

const fighterOf = (state, fighterId) =>
  player(state, '0').fighters.find(entry => entry.id === fighterId);

const lostIds = state => (player(state, '0').lost ?? []).map(entry => entry.id);

describe('способность Ифрита (Пламя преисподней)', () => {
  it('контент использует только известные моменты', () => {
    for (const rule of ifrit.skill.rules) {
      expect(isMoment(rule.moment)).toBe(true);
    }
  });

  it('умение описано по контракту: type, fighter, title, text, rules', () => {
    expect(ifrit.skill.type).toBe('skill');
    expect(ifrit.skill.fighter).toBe('ifrit');
    expect(ifrit.skill.title).toBe('Пламя преисподней');
    expect(ifrit.skill.text).toContain('1 действие');
    expect(Array.isArray(ifrit.skill.rules)).toBe(true);
  });

  it('три духа — окно с выбором, ход не начался, пока игрок не решил', () => {
    const state = runLifecycle(skillState());

    expect(state.targeting).toMatchObject({
      playerId: '0',
      source: 'ifrit_skill',
      required: false,
      auto: true,
      count: 1,
    });
    expect(state.targeting.candidates.map(entry => entry.fighterId)).toEqual([
      'ash_1',
      'ash_2',
      'ash_3',
    ]);
    expect(runUi(state, '0').hint).toBe(ifrit.skill.text);
  });

  it('клик по духу убивает его и даёт действие до конца хода', () => {
    const opened = runLifecycle(skillState());
    const after = runAction(opened, {
      type: 'PICK',
      kind: 'fighter',
      id: 'ash_2',
      playerId: '0',
    });

    expect(fighterOf(after, 'ash_2')).toBeUndefined();
    expect(lostIds(after)).toEqual(['ash_2']);
    expect(fighterOf(after, 'ash_1')).toBeDefined();
    // 2 действия хода + 1 от умения; общий счётчик хода тоже растёт — на него смотрит «Счёт ударов»
    expect(ap(after)).toBe(3);
    expect(after.turn.actionsTotal).toBe(3);
    expect(after.targeting).toBeNull();
  });

  it('дух остался один — движок отмечает его сам, окна игрок не видит', () => {
    const state = runLifecycle(skillState({ spirits: ['ash_3'] }));

    expect(state.targeting).toBeNull();
    expect(fighterOf(state, 'ash_3')).toBeUndefined();
    expect(lostIds(state)).toEqual(['ash_3']);
    expect(ap(state)).toBe(3);
  });

  it('отказ от окна: духи целы, лишнего действия нет', () => {
    const state = runLifecycle(skillState());
    const after = runAction(state, { type: 'UI_OK', playerId: '0' });

    expect(after.targeting).toBeNull();
    expect(lostIds(after)).toEqual([]);
    expect(ap(after)).toBe(2);
    expect(after.turn.actionsTotal).toBe(2);
  });

  it('духов нет — умение молчит и окна не открывает', () => {
    const state = runLifecycle(skillState({ spirits: [] }));

    expect(state.targeting).toBeNull();
    expect(ap(state)).toBe(2);
  });

  it('герой без умения окна не открывает', () => {
    const state = runLifecycle(skillState({ skill: null }));

    expect(state.targeting).toBeNull();
    expect(ap(state)).toBe(2);
  });
});
