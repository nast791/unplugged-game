import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_08');

/** Линия 1—2—3—4: Дороти стоит на 1 или 2, Бета — на 3. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
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

/** Дороти на `heroCell`: 2 — она уже на месте удара, 1 — сначала придётся идти. */
const buildState = ({ heroCell = 2 } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [unit('dorothy', heroCell, 12)],
        [{ ...card, instanceId: 'dorothy_08_1' }],
        [deckCard(0), deckCard(1)],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Объявленное перемещение: клик по колоде, шаг Дороти, конец действия. */
const move = (state, cellId) => {
  let run = runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' });
  run = runAction(run, {
    type: 'PICK',
    kind: 'cell',
    id: cellId,
    fighterId: 'dorothy',
    playerId: '0',
  });
  return runAction(run, { type: 'UI_OK', playerId: '0' });
};

/** Дороти бьёт Бету «Наотмашь»; защитник пасует. */
const battle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'dorothy_08_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта dorothy_08 «Наотмашь»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('duringCombat');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({ type: 'attack', value: 3, bonus: 2, fighter: 'dorothy' });
    expect(card.rules[0].when[0]).toMatchObject({
      fact: 'FIGHTERS',
      params: { fighterIds: ['dorothy'], movedThisTurn: false },
    });
  });

  it('Дороти не перемещалась — +2, атака 5', () => {
    const after = battle(buildState({ heroCell: 2 }));

    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(5);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(8);
  });

  it('Дороти перемещалась в этом ходу — бонуса нет, атака 3', () => {
    const walked = move(buildState({ heroCell: 1 }), 2);

    // шаг по полю поднял флаг «двигался в этом ходу»
    expect(fighterOf(walked, '0', 'dorothy').movedThisTurn).toBe(true);
    expect(fighterOf(walked, '0', 'dorothy').currentPosition).toBe(2);

    const after = battle(walked);

    expect(after.lastCombat.attackValue).toBe(3);
    expect(after.lastCombat.combatDamage).toBe(3);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(10);
  });
});
