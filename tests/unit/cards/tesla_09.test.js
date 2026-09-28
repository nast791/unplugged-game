import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/gameEngine.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = teslaCards.find(entry => entry.id === 'tesla_09');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'arcane' },
    { id: 2, neighbors: [1], terrain: 'arcane' },
  ],
};

const unit = (id, cell, hp, extra = {}) => ({
  ...fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 3,
    attackRange: 1,
  }),
  ...extra,
});

const slot = (id, name, order, fighters, hand = [], deck = [], items = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: { visibility: [], cards: deck },
  hand: { visibility: [], cards: hand },
  discard: { visibility: [], cards: [] },
  fighters,
  items,
});

const coilsOf = (states = ['inactive', 'inactive']) =>
  states.map((state, index) => ({
    id: `coil_${index + 1}`,
    group: 'coil',
    name: 'Катушка Теслы',
    copies: 2,
    state,
  }));

/** Защита Беты: 5 против атаки 2 — побеждает защитник — и пас, когда карты нет. */
const defenseCard = {
  id: 'beta_guard',
  instanceId: 'beta_guard_1',
  title: 'Отпор',
  type: 'defense',
  value: 5,
  bonus: 1,
  fighter: 'beta',
};

const state = (coilStates, withDefense = false) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Тесла',
        1,
        [unit('tesla', 1, 14, { attackType: 'ranged', startHp: 14 })],
        [{ ...card, instanceId: 'tesla_09_1' }],
        [],
        coilsOf(coilStates),
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 2, 13, { attackType: 'ranged' })],
        withDefense ? [defenseCard] : [],
      ),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Тесла бьёт Бету «Инерционным зарядом»; Бета отвечает картой защиты 5 или пасует. */
const battle = (coilStates, withDefense = false) => {
  let fight = runAction(state(coilStates, withDefense), {
    type: 'PICK',
    kind: 'card',
    id: 'tesla_09_1',
    playerId: '0',
  });
  fight = runAction(fight, {
    type: 'PICK',
    kind: 'fighter',
    id: 'beta',
    playerId: '0',
  });

  return withDefense
    ? runAction(fight, {
        type: 'PICK',
        kind: 'card',
        id: 'beta_guard_1',
        playerId: '1',
      })
    : runAction(fight, { type: 'UI_OK', playerId: '1' });
};

const coilStates = state => player(state, '0').items.map(item => item.state);

describe('карта tesla_09 «Инерционный заряд»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['afterCombat', 'afterCombat']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.options).toBeUndefined();
  });

  it('победа в битве: одна катушка заряжается, а за победу — вторая', () => {
    const after = battle(['inactive', 'inactive']);

    expect(after.lastCombat.combatDamage).toBe(2);
    expect(coilStates(after)).toEqual(['active', 'active']);
    expect(after.combat).toBeNull();
  });

  it('поражение: без победы заряжается только одна катушка', () => {
    const after = battle(['inactive', 'inactive'], true);

    expect(after.lastCombat.combatDamage).toBe(0);
    expect(coilStates(after)).toEqual(['active', 'inactive']);
  });

  it('«зарядите 1 катушку» берёт именно разряженную, а не первую по порядку', () => {
    const after = battle(['active', 'inactive'], true);

    expect(coilStates(after)).toEqual(['active', 'active']);
  });

  it('победа при уже заряженных катушках: повторный заряд ничего не ломает', () => {
    const after = battle(['active', 'active']);

    expect(coilStates(after)).toEqual(['active', 'active']);
  });
});
