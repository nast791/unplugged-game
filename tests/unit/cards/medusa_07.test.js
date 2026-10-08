import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = medusaCards.find(entry => entry.id === 'medusa_07');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2], terrain: 'ice' },
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

/** Медуза (игрок 0) бьёт Бету картой «Ядовитая стрела»; `deck` — её колода. */
const buildState = (deck = [deckCard(0), deckCard(1)]) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [
          unit('medusa', 1, 16, { attackRange: 3 }),
          unit('harpies_1', 2, 1, { type: 'assistant', group: 'harpies' }),
        ],
        [{ ...card, instanceId: 'medusa_07_1' }],
        deck,
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 3, 13, { attackRange: 3 })],
        [
          {
            id: 'beta_atk',
            instanceId: 'beta_atk_1',
            type: 'attack',
            value: 3,
            bonus: 1,
            fighter: 'beta',
          },
        ],
      ),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Медуза объявляет бой, выбирает бойца и цель; защитник пасует. */
const playAttack = (deck = [deckCard(0), deckCard(1)], patch = null) => {
  const start = buildState(deck);
  if (patch) patch(start);

  let battle = runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'medusa_07_1',
    playerId: '0',
  });
  battle = runAction(battle, {
    type: 'PICK',
    kind: 'fighter',
    id: 'medusa',
    playerId: '0',
  });
  battle = runAction(battle, {
    type: 'PICK',
    kind: 'fighter',
    id: 'beta',
    playerId: '0',
  });
  return runAction(battle, { type: 'UI_OK', playerId: '1' });
};

const handIds = (state, playerId) => player(state, playerId).hand.cards.map(c => c.id);
const deckSize = (state, playerId) => player(state, playerId).deck.cards.length;
const heroHp = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId)?.currentHp;

describe('карта medusa_07 «Ядовитая стрела»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
  });

  it('после боя владелец карты добирает 1 карту', () => {
    const after = playAttack([deckCard(0), deckCard(1)]);

    expect(after.combat).toBeNull();
    expect(deckSize(after, '0')).toBe(1);
    expect(handIds(after, '0')).toContain('deck_1');
    expect(after.hook).toBe(PHASES.turn);
  });

  it('пустая колода: карта не берётся, главный герой получает истощение', () => {
    const after = playAttack([]);

    expect(handIds(after, '0')).toEqual([]);
    // истощение — 2 урона главному герою, помощник не страдает
    expect(heroHp(after, '0', 'medusa')).toBe(14);
    expect(heroHp(after, '0', 'harpies_1')).toBe(1);
    expect(after.hook).toBe(PHASES.turn);
  });

  it('истощение может добить героя, и партия завершается после боя', () => {
    const after = playAttack([], state => {
      player(state, '0').fighters.find(entry => entry.id === 'medusa').currentHp = 2;
    });

    expect(after.combat).toBeNull();
    expect(player(after, '0').fighters.map(entry => entry.id)).toEqual(['harpies_1']);
    expect(after.hook).toBe(PHASES.gameEnd);
    expect(after.winner).toBe('1');
  });
});
