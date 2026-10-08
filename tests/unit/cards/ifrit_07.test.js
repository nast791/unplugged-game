import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, discard, fighter, hand, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_07');

/** Линия 1—2—3: Ифрит на 1, дух на 2 (бьёт Бету на 3). */
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
    move: 2,
    attackRange: 1,
  }),
  startHp: hp,
  ...extra,
});

const filler = index => ({
  id: `filler_${index}`,
  instanceId: `filler_${index}`,
  type: 'effect',
  value: 0,
  bonus: 1,
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

/** Дух бьёт Бету «Пеплом в глаза»; Бета держит `handCards` карт. */
const buildState = ({ handCards = [filler(1), filler(2)] } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [
          unit('ifrit', 1, 14, { attackRange: 3 }),
          unit('ash_1', 2, 1, { name: 'Дух', type: 'assistant', group: 'ash' }),
        ],
        [{ ...card, instanceId: 'ifrit_07_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 14)], handCards),
    ],
    // сид фиксирован: «случайная» карта берётся последовательностью партии, тест детерминирован
    settings: { seed: 7 },
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Дух объявляет атаку (кандидат один), Бета пасует. */
const fight = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_07_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_07 «Пепел в глаза»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('immediately');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'hybrid',
      value: 2,
      bonus: 2,
      quantity: 2,
      fighter: 'ash',
    });
    expect(card.rules[0].when[0]).toMatchObject({
      fact: 'COMBAT',
      params: { player: 'opponent' },
      var: 'enemy',
    });
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_CARDS',
      of: '$enemy',
      op: 'discard',
      random: true,
      count: 1,
    });
  });

  it('у противника сбрасывается ровно одна карта из руки', () => {
    const after = fight(buildState({ handCards: [filler(1), filler(2), filler(3)] }));

    expect(hand(player(after, '1')).map(entry => entry.id)).toHaveLength(2);
    expect(discard(player(after, '1')).map(entry => entry.id)).toHaveLength(1);
    // карта ушла именно в сброс противника, а не осталась в руке
    const left = hand(player(after, '1')).map(entry => entry.id);
    const thrown = discard(player(after, '1')).map(entry => entry.id)[0];
    expect(left).not.toContain(thrown);
    // сам бой состоялся: 2 урона по Бете
    expect(after.lastCombat.attackValue).toBe(2);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(12);
  });

  it('сброс выбирает последовательность партии, а не игрок: тот же сид — та же карта', () => {
    const first = fight(buildState({ handCards: [filler(1), filler(2), filler(3)] }));
    const second = fight(buildState({ handCards: [filler(1), filler(2), filler(3)] }));

    expect(discard(player(first, '1')).map(entry => entry.id)).toEqual(
      discard(player(second, '1')).map(entry => entry.id),
    );
  });

  it('рука противника пуста — свойство ничего не сбрасывает и не падает', () => {
    const after = fight(buildState({ handCards: [] }));

    expect(hand(player(after, '1'))).toEqual([]);
    expect(discard(player(after, '1'))).toEqual([]);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(12);
  });

  it('у противника одна карта — уходит именно она', () => {
    const after = fight(buildState({ handCards: [filler(9)] }));

    expect(hand(player(after, '1'))).toEqual([]);
    expect(discard(player(after, '1')).map(entry => entry.id)).toEqual(['filler_9']);
  });
});
