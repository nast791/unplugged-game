import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = medusaCards.find(entry => entry.id === 'medusa_09');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1], terrain: 'ice' },
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
    move: 3,
    attackRange: 1,
  }),
  ...extra,
});

const deckCard = index => ({
  id: `deck_${index}`,
  instanceId: `deck_${index}`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

const slot = (id, name, order, fighters, hand = [], deck = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone(deck),
  hand: zone(hand),
  discard: zone([]),
  fighters,
});

/** У Медузы только герой: карта без привязки, боец один — атакующий выбирается сам. */
const buildState = ({ deck = [deckCard(0), deckCard(1), deckCard(2)], defense = null } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [unit('medusa', 1, 16, { attackRange: 3 })],
        [{ ...card, instanceId: 'medusa_09_1' }],
        deck,
      ),
      slot('1', 'Бета', 2, [unit('beta', 2, 13, { attackRange: 3 })], defense ? [defense] : []),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const attackRejection = defense => ({
  id: 'beta_def',
  instanceId: 'beta_def_1',
  title: 'beta_def',
  type: 'defense',
  value: defense,
  bonus: 1,
  fighter: 'beta',
});

/** Медуза бьёт Бету картой «Второе дыхание»; защитник либо пасует, либо играет карту защиты. */
const playBattle = (options = {}) => {
  let battle = runAction(buildState(options), {
    type: 'PICK',
    kind: 'card',
    id: 'medusa_09_1',
    playerId: '0',
  });
  battle = runAction(battle, {
    type: 'PICK',
    kind: 'fighter',
    id: 'beta',
    playerId: '0',
  });

  if (!options.defense) return runAction(battle, { type: 'UI_OK', playerId: '1' });

  return runAction(battle, {
    type: 'PICK',
    kind: 'card',
    id: 'beta_def_1',
    playerId: '1',
  });
};

const handIds = (state, playerId) => player(state, playerId).hand.cards.map(entry => entry.id);
const deckSize = (state, playerId) => player(state, playerId).deck.cards.length;
const heroHp = (state, playerId) =>
  player(state, playerId).fighters.find(entry => entry.id === 'medusa')?.currentHp;

describe('карта medusa_09 «Второе дыхание»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules).toHaveLength(2);
    for (const rule of card.rules) {
      expect(rule.moment).toBe('afterCombat');
      expect(isMoment(rule.moment)).toBe(true);
    }
    expect(card.hook).toBeUndefined();
  });

  it('при победе в бою добор 2 карт вместо одной', () => {
    // защитник пасует: атака 1 против защиты 0 — атакующий победил
    const after = playBattle();

    expect(after.lastCombat.winner).toBe('attacker');
    expect(deckSize(after, '0')).toBe(1);
    expect(handIds(after, '0')).toEqual(['deck_2', 'deck_1']);
  });

  it('при проигранном бое добор 1 карты', () => {
    const after = playBattle({ defense: attackRejection(3) });

    expect(after.lastCombat.winner).toBe('defender');
    expect(deckSize(after, '0')).toBe(2);
    expect(handIds(after, '0')).toHaveLength(1);
  });

  it('победа с пустой колодой: 2 карты недоставало — истощение 4 урона', () => {
    const after = playBattle({ deck: [] });

    expect(handIds(after, '0')).toEqual([]);
    expect(heroHp(after, '0')).toBe(12);
  });

  it('работает и в защите: победа защитой даёт 2 карты', () => {
    // Бета атакует с нулевым значением, Медуза защищается «Вторым дыханием» (1) — победил защитник
    const state = createState({
      phase: PHASES.turn,
      map: lineMap,
      players: [
        slot(
          '0',
          'Медуза',
          1,
          [unit('medusa', 1, 16, { attackRange: 3 })],
          [{ ...card, instanceId: 'medusa_09_1' }],
          [deckCard(0), deckCard(1), deckCard(2)],
        ),
        slot(
          '1',
          'Бета',
          2,
          [unit('beta', 2, 13, { attackRange: 3 })],
          [
            {
              id: 'beta_atk',
              instanceId: 'beta_atk_1',
              type: 'attack',
              value: 0,
              bonus: 1,
              fighter: 'beta',
            },
          ],
        ),
      ],
      turn: { index: 1, playerId: '1', actedRound: ['1'] },
      _enteredHooks: { gameStart: true, turn: true },
    });

    let battle = runAction(state, {
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
    const after = runAction(battle, {
      type: 'PICK',
      kind: 'card',
      id: 'medusa_09_1',
      playerId: '0',
    });

    expect(after.lastCombat.winner).toBe('defender');
    expect(deckSize(after, '0')).toBe(1);
    expect(handIds(after, '0')).toEqual(['deck_2', 'deck_1']);
    expect(heroHp(after, '0')).toBe(16);
  });
});
