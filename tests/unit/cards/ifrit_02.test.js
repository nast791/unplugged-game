import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_02');

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

/** Линия 1—2—3: стихию клетки 2 задаёт тест — на ней стоит Ифрит. */
const lineMap = terrain => ({
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain },
    { id: 3, neighbors: [2], terrain: 'ice' },
  ],
});

/** Ифрит на 2 (стихия `terrain`), Бета на 3 вплотную с картой в руке. */
const buildState = ({ terrain = 'ice' } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap(terrain),
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 2, 14, { attackRange: 3 })],
        [{ ...card, instanceId: 'ifrit_02_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 13)], [
        { id: 'ifbat', title: 'Карта Беты', type: 'attack', value: 2, bonus: 1 },
      ]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const battle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_02_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_02 «Жар из-под земли»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['afterCombat']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'attack',
      value: 4,
      bonus: 3,
      quantity: 3,
      fighter: 'ifrit',
    });
    expect(card.rules[0].when[0]).toMatchObject({
      fact: 'FIGHTERS',
      params: { fighterIds: ['ifrit'], terrain: 'lava' },
    });
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_HEALTH',
      fighterIds: '$foes',
      delta: -2,
    });
    expect(card.rules[0].then[1]).toMatchObject({
      action: 'SET_CARDS',
      of: '$enemy',
      op: 'discard',
      random: true,
      count: 1,
    });
  });

  it('Ифрит на лаве: после битвы 2 урона бойцу и сброс случайной карты', () => {
    const after = battle(buildState({ terrain: 'lava' }));

    expect(after.lastCombat.attackValue).toBe(4);
    expect(after.lastCombat.combatDamage).toBe(4);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(7);
    expect(player(after, '1').hand.cards).toEqual([]);
    expect(player(after, '1').discard.cards.map(entry => entry.id)).toEqual(['ifbat']);
  });

  it('вне лавы свойство не срабатывает: только урон боем', () => {
    const after = battle(buildState({ terrain: 'ice' }));

    expect(after.lastCombat.attackValue).toBe(4);
    expect(after.lastCombat.combatDamage).toBe(4);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(9);
    expect(player(after, '1').hand.cards.map(entry => entry.id)).toEqual(['ifbat']);
  });

  it('пустыня больше не усиливает карту: значение и урон прежние', () => {
    const after = battle(buildState({ terrain: 'desert' }));

    expect(after.lastCombat.attackValue).toBe(4);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(9);
    expect(player(after, '1').hand.cards.map(entry => entry.id)).toEqual(['ifbat']);
  });
});
