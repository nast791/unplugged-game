import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runLifecycle, runUi } from '#shared/publicApi.js';
import { runSkillMoment } from '#shared/skills/run.js';
import anubis from '../../../server/content/heroes/anubis/index.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

/**
 * Линия 1—2—3—4: 1—2 пустыня (область Анубиса), 3—4 лёд (своя область).
 * Анубис на 1, враг на 2 — оба в песке; Анубис на 1, враг на 4 — разные области.
 */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'desert' },
    { id: 2, neighbors: [1, 3], terrain: 'desert' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3], terrain: 'ice' },
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

const shroud = state => ({
  id: 'shroud',
  group: 'shroud',
  name: 'Пелена',
  type: 'item',
  count: 1,
  state,
});

const slot = (id, name, order, fighters, items = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone([]),
  discard: zone([]),
  fighters,
  items,
});

/** Ход Анубиса (игрок 0): `cell` — его клетка, `foeCell` — клетка врага, `shroudState` — пелена. */
const buildState = ({
  cell = 1,
  foeCell = 2,
  shroudState = 'inactive',
  moved = false,
  skill = anubis.skill,
} = {}) =>
  createState({
    phase: PHASES.turn,
    actionsLeft: 0,
    map: lineMap,
    players: [
      {
        ...slot(
          '0',
          'Анубис',
          1,
          [
            unit('anubis', cell, 15, { attackRange: 2, movedThisTurn: moved }),
            unit('amat', cell, 8, { type: 'assistant', group: 'amat' }),
          ],
          [shroud(shroudState)],
        ),
        skill,
      },
      slot('1', 'Бета', 2, [unit('beta', foeCell, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Ход закончился: здесь входит умение конца хода. */
const endTurn = state => {
  state.hook = PHASES.turnEnd;
  return runLifecycle(state);
};

const itemState = (state, playerId = '0') => player(state, playerId).items[0]?.state ?? null;

const hpOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId)?.currentHp ?? 0;

const clickFighter = (state, id) =>
  runAction(state, { type: 'PICK', kind: 'fighter', id, playerId: '0' });

describe('способность Анубиса (Взвешивание сердца)', () => {
  it('контент использует только известные моменты', () => {
    for (const rule of anubis.skill.rules) {
      expect(isMoment(rule.moment)).toBe(true);
    }
  });

  it('герой, помощник, предмет и поле стихии описаны по паспорту', () => {
    expect(anubis.skill.type).toBe('skill');
    expect(anubis.skill.fighter).toBe('anubis');
    expect(anubis.skill.title).toBe('Взвешивание сердца');
    expect(anubis.skill.text).toContain('КОНЕЦ ХОДА');
    expect(anubis.heroes[0]).toMatchObject({ hp: 15, move: 2, attackRange: 2 });
    expect(anubis.assistants[0]).toMatchObject({ id: 'amat', hp: 8, move: 2, attackRange: 1 });
    // предмет — индикатор эффекта: в начале партии пелены нет, подписи и условие видит игрок в панели
    expect(anubis.items[0]).toMatchObject({ id: 'shroud', state: 'inactive', count: 1 });
    expect(anubis.items[0].states).toEqual({ active: 'цела', inactive: 'отсутствует' });
    expect(anubis.items[0].condition).toContain('Погребальная пелена');
    expect(anubis.items[0].condition).toContain('пустыни');
    expect(anubis.terrainAffinity).toEqual(['desert']);
  });

  it('пелены нет: один враг в области — движок отмечает его сам и бьёт на 1', () => {
    const state = endTurn(buildState({ shroudState: 'inactive' }));

    // враг один: окна игрок не видит, урон уже нанесён
    expect(state.targeting ?? null).toBeNull();
    expect(hpOf(state, '1', 'beta')).toBe(12);
  });

  it('пелена цела: суд наносит 2 урона', () => {
    const state = endTurn(buildState({ shroudState: 'active' }));

    expect(hpOf(state, '1', 'beta')).toBe(11);
  });

  it('Анубис двигался — суда нет, ход закрывается', () => {
    const state = endTurn(buildState({ moved: true }));

    expect(state.targeting ?? null).toBeNull();
    expect(hpOf(state, '1', 'beta')).toBe(13);
  });

  it('враг в другой области — судить некого', () => {
    const state = endTurn(buildState({ cell: 1, foeCell: 4 }));

    expect(hpOf(state, '1', 'beta')).toBe(13);
  });

  it('врагов в области двое — окно с выбором цели, подсказка — текст умения', () => {
    const state = buildState({ shroudState: 'inactive' });
    player(state, '1').fighters.push(unit('beta2', 1, 9));

    const opened = endTurn(state);

    expect(opened.targeting).toMatchObject({
      playerId: '0',
      source: 'anubis_skill',
      kind: 'fighters',
      required: false,
    });
    expect(opened.targeting.candidates.map(entry => entry.fighterId).sort()).toEqual([
      'beta',
      'beta2',
    ]);
    expect(runUi(opened, '0').hint).toBe(anubis.skill.text);

    const after = clickFighter(opened, 'beta2');

    expect(hpOf(after, '1', 'beta2')).toBe(8);
    expect(hpOf(after, '1', 'beta')).toBe(13);
  });

  it('пелена цела и Анубис на пустыне — начало хода её сохраняет', () => {
    const state = runSkillMoment(buildState({ shroudState: 'active', cell: 1 }), '0', 'turnStart');

    expect(itemState(state)).toBe('active');
  });

  it('пелена цела, но Анубис вне пустыни — начало хода её рвёт', () => {
    const state = runSkillMoment(buildState({ shroudState: 'active', cell: 3 }), '0', 'turnStart');

    expect(itemState(state)).toBe('inactive');
  });

  it('пелена уже порвана — начало хода ничего не меняет', () => {
    const state = runSkillMoment(
      buildState({ shroudState: 'inactive', cell: 3 }),
      '0',
      'turnStart',
    );

    expect(itemState(state)).toBe('inactive');
  });
});
