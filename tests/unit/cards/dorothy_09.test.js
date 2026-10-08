import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_09');

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

const cardOf = (id, extra = {}) => ({
  id,
  instanceId: `${id}_1`,
  type: 'effect',
  value: 0,
  bonus: 1,
  ...extra,
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

/** Дороти держит «Зелёные очки»; `deck` — что осталось в колоде. */
const buildState = ({ deck = [cardOf('deck_0'), cardOf('deck_1'), cardOf('deck_2')] } = {}) =>
  createState({
    phase: PHASES.turn,
    map: {
      id: 'line',
      nodes: [
        { id: 1, neighbors: [2], terrain: 'ice' },
        { id: 2, neighbors: [1], terrain: 'ice' },
      ],
    },
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [unit('dorothy', 1, 12)],
        [{ ...card, instanceId: 'dorothy_09_1' }, cardOf('hand_1', { type: 'attack', value: 2 })],
        deck,
      ),
      slot('1', 'Бета', 2, [unit('beta', 2, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Разыграть эффектную карту: одно действие, карта открыто уходит в сброс. */
const play = state =>
  runAction(state, { type: 'PICK', kind: 'card', id: 'dorothy_09_1', playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта dorothy_09 «Зелёные очки»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('effect');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({ type: 'effect', value: null, bonus: 2, fighter: 'any' });
  });

  it('действие целиком: карта в сбросе, из колоды приходят 2 карты', () => {
    const state = buildState();

    const after = play(state);

    expect(after.turn.actionsLeft).toBe(1);
    expect(player(after, '0').discard.cards.map(entry => entry.id)).toEqual(['dorothy_09']);
    // верх колоды — конец массива: сначала deck_2, за ней deck_1
    expect(player(after, '0').hand.cards.map(entry => entry.id)).toEqual([
      'hand_1',
      'deck_2',
      'deck_1',
    ]);
    expect(player(after, '0').deck.cards.map(entry => entry.id)).toEqual(['deck_0']);
    // эффект закончился в том же клике: слота эффекта и окон не осталось
    expect(after.effect ?? null).toBeNull();
    expect(after.targeting ?? null).toBeNull();
  });

  it('пустая колода: обе карты не нашлись, Дороти получает истощение 4', () => {
    const after = play(buildState({ deck: [] }));

    expect(player(after, '0').hand.cards.map(entry => entry.id)).toEqual(['hand_1']);
    expect(fighterOf(after, '0', 'dorothy').currentHp).toBe(8);
  });
});
