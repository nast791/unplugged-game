import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
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

const slot = (id, name, order, fighters, items = [], lost = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone([]),
  discard: zone([]),
  fighters,
  items,
  lost,
});

/**
 * Ход Анубиса (игрок 0): `shroudState` — пелена, `amatLost` — убита ли Амат
 * (по ней в начале хода рвётся пелена), `skill` — подменённое умение.
 */
const buildState = ({
  cell = 1,
  foeCell = 2,
  shroudState = 'active',
  amatLost = false,
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
            unit('anubis', cell, 15, { attackRange: 2 }),
            ...(amatLost ? [] : [unit('amat', cell, 8, { type: 'assistant', group: 'amat' })]),
          ],
          [shroud(shroudState)],
          amatLost ? [unit('amat', null, 0, { type: 'assistant', group: 'amat' })] : [],
        ),
        skill,
      },
      slot('1', 'Бета', 2, [unit('beta', foeCell, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const itemState = (state, playerId = '0') => player(state, playerId).items[0]?.state ?? null;

describe('способность Анубиса (Суд Осириса)', () => {
  it('контент использует только известные моменты', () => {
    for (const rule of anubis.skill.rules) {
      expect(isMoment(rule.moment)).toBe(true);
    }
  });

  it('герой, помощник, пелена и поле стихии описаны по паспорту', () => {
    expect(anubis.skill.type).toBe('skill');
    expect(anubis.skill.fighter).toBe('anubis');
    expect(anubis.skill.title).toBe('Суд Осириса');
    expect(anubis.skill.text).toContain('пелена');
    expect(anubis.skill.text).toContain('пометкой весов');
    expect(anubis.skill.text).toContain('Помилование');
    expect(anubis.skill.text).toContain('Наказание');
    expect(anubis.skill.text).toContain('НАЧАЛО ХОДА');
    expect(anubis.skill.rules).toHaveLength(1);
    expect(anubis.skill.rules[0].moment).toBe('turnStart');
    expect(anubis.heroes[0]).toMatchObject({ hp: 15, move: 2, attackRange: 2 });
    expect(anubis.assistants[0]).toMatchObject({ id: 'amat', hp: 8, move: 2, attackRange: 1 });
    // пелена активна с начала партии: предмет — индикатор суда, подпись состояния даёт клиент
    expect(anubis.items[0]).toMatchObject({ id: 'shroud', state: 'active', count: 1 });
    expect(anubis.items[0].states).toBeUndefined();
    expect(anubis.items[0].condition).toContain('Амат');
    expect(anubis.items[0].condition).toContain('навсегда');
    expect(anubis.tags).toEqual(['scales']);
    expect(anubis.terrainAffinity).toEqual(['desert']);
  });

  it('Амат жива — начало хода пелену сохраняет', () => {
    const state = runSkillMoment(buildState({ shroudState: 'active' }), '0', 'turnStart');

    expect(itemState(state)).toBe('active');
  });

  it('Амат мертва — начало хода пелену рвёт навсегда', () => {
    const state = runSkillMoment(buildState({ shroudState: 'active', amatLost: true }), '0', 'turnStart');

    expect(itemState(state)).toBe('inactive');
  });

  it('пелена уже порвана — начало хода ничего не меняет', () => {
    const state = runSkillMoment(
      buildState({ shroudState: 'inactive', cell: 3, amatLost: true }),
      '0',
      'turnStart',
    );

    expect(itemState(state)).toBe('inactive');
  });
});
