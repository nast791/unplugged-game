import { describe, expect, it } from 'vitest';
import { runAction, runUi } from '#shared/gameEngine.js';
import { attackCandidates, attackRejection } from '#shared/helpers/combat.js';
import {
  cardFighterId,
  fighterMatchesCard,
  hasFighterForCard,
} from '#shared/helpers/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], areas: ['#blue'] },
    { id: 2, neighbors: [1, 3], areas: ['#blue'] },
    { id: 3, neighbors: [2], areas: ['#blue'] },
  ],
};

const zone = cards => ({ visibility: [], cards });

const unit = (id, cell, hp, { type = 'hero', group = null, attackType = 'melee' } = {}) => ({
  ...fighter({
    id,
    name: id,
    type,
    currentPosition: cell,
    currentHp: hp,
    move: 3,
    attackRange: 1,
  }),
  group,
  attackType,
});

const card = (id, type, value, binding) => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type,
  value,
  bonus: 1,
  fighter: binding,
});

const slot = (id, name, order, fighters, hand = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone(hand),
  discard: zone([]),
  fighters,
});

const handCardOf = (state, id) =>
  handCards(state).find(entry => entry.id === id);

const handCards = state => player(state, '0').hand.cards;

/**
 * Медуза (игрок 0) — дальний боец, рядом Гарпия (помощник с группой 'harpies').
 * В руке: атака Гарпий, атака «любым бойцом», защита Гарпий. У Беты — своя атака.
 * `harpiesAlive: false` — Гарпия снята с поля (нет живых Гарпий).
 */
const state = (harpiesAlive = true, turnPlayerId = '0') =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [
          unit('medusa', 1, 16, { attackType: 'ranged' }),
          unit('harpies_1', 2, harpiesAlive ? 4 : 0, {
            type: 'assistant',
            group: 'harpies',
          }),
        ],
        [
          card('harpy_atk', 'attack', 3, 'harpies'),
          card('any_atk', 'attack', 4, 'any'),
          card('harpy_def', 'defense', 2, 'harpies'),
        ],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 13, { attackType: 'ranged' })], [
        card('beta_atk', 'attack', 3, 'beta'),
      ]),
    ],
    turn: { index: 1, playerId: turnPlayerId, actedRound: [turnPlayerId] },
    _enteredHooks: { gameStart: true, turn: true },
  });

describe('привязка карты к бойцу', () => {
  it('«any» и пустое значение — без привязки, иначе id бойца или группы', () => {
    const harpy = unit('harpies_1', 2, 4, { type: 'assistant', group: 'harpies' });

    expect(cardFighterId({ fighter: 'any' })).toBeNull();
    expect(cardFighterId({ fighter: 'harpies' })).toBe('harpies');
    expect(cardFighterId({})).toBeNull();
    // помощники одного вида: id `harpies_1`, группа `harpies` — карта подходит обоим
    expect(fighterMatchesCard(harpy, { fighter: 'harpies' })).toBe(true);
    expect(fighterMatchesCard(harpy, { fighter: 'harpies_2' })).toBe(false);
    expect(fighterMatchesCard(harpy, { fighter: 'any' })).toBe(true);
  });

  it('карту Гарпий можно играть, пока Гарпия на поле', () => {
    const alive = state();
    expect(hasFighterForCard(alive, '0', handCardOf(alive, 'harpy_atk'))).toBe(true);
    expect(
      attackCandidates(alive, '0', handCardOf(alive, 'harpy_atk')).map(
        entry => entry.fighterId,
      ),
    ).toEqual(['harpies_1']);
    expect(attackRejection(alive, '0', 'harpy_atk_1')).toBeNull();
  });

  it('без живых Гарпий их карты в атаку не идут', () => {
    const dead = state(false);
    expect(hasFighterForCard(dead, '0', handCardOf(dead, 'harpy_atk'))).toBe(false);
    expect(attackCandidates(dead, '0', handCardOf(dead, 'harpy_atk'))).toEqual([]);
    expect(attackRejection(dead, '0', 'harpy_atk_1')).toMatch(/нет на поле/);

    const ui = runUi(dead, '0');
    expect(ui.playableCardIds).toEqual(['any_atk_1']);
    expect(ui.disabledCardIds).toEqual(['harpy_atk_1', 'harpy_def_1']);

    expect(() =>
      runAction(dead, {
        type: 'PICK',
        kind: 'card',
        id: 'harpy_atk_1',
        playerId: '0',
      }),
    ).toThrow(/нет на поле/);
  });

  it('карта «любым бойцом» играется, даже если Гарпий нет', () => {
    const dead = state(false);
    expect(
      attackCandidates(dead, '0', handCardOf(dead, 'any_atk')).map(
        entry => entry.fighterId,
      ),
    ).toEqual(['medusa']);
    expect(attackRejection(dead, '0', 'any_atk_1')).toBeNull();
  });

  it('в защиту карту Гарпий без живой Гарпии не сыграть', () => {
    const dead = state(false, '1');
    let battle = runAction(dead, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });
    battle = runAction(battle, {
      type: 'PICK',
      kind: 'fighter',
      id: 'medusa',
      playerId: '1',
    });
    expect(battle.combat.stage).toBe('defense');
    expect(battle.combat.defenderPlayerId).toBe('0');

    // единственная карта защиты Медузы привязана к Гарпиям, которых нет
    expect(runUi(battle, '0').playableCardIds).toEqual([]);
    expect(() =>
      runAction(battle, {
        type: 'PICK',
        kind: 'card',
        id: 'harpy_def_1',
        playerId: '0',
      }),
    ).toThrow(/нет на поле/);
  });
});
