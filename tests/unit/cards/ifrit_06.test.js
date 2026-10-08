import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, fighter, hand, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_06');

/** Линия 1—2—3—4: Ифрит на 1, Бета на 3, дух подходит вплотную на 4. */
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

const spirit = (index, cell) =>
  unit(`ash_${index}`, cell, 1, {
    name: `Пепельный дух ${index}`,
    type: 'assistant',
    group: 'ash',
  });

const deadSpirit = index => ({ ...spirit(index, null), currentPosition: null, currentHp: 0 });

const deckCard = index => ({
  id: `deck_${index}`,
  instanceId: `deck_${index}`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

const slot = (id, name, order, fighters, hand = [], deckCards = [], lost = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone(deckCards),
  hand: zone(hand),
  discard: zone([]),
  fighters,
  lost,
});

/**
 * Карта в руке и `spirits` живых духов: первый стоит на 4 (вплотную к Бете), остальные — на 2.
 * Карта привязана к группе `ash`, поэтому атакующего выбирает игрок.
 */
const buildState = ({ spirits = [1, 2, 3], deckCards = [deckCard(1), deckCard(2)] } = {}) =>
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
          ...spirits.map((index, position) => spirit(index, position === 0 ? 4 : 2)),
        ],
        [{ ...card, instanceId: 'ifrit_06_1' }],
        deckCards,
        [1, 2, 3].filter(index => !spirits.includes(index)).map(deadSpirit),
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 14)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Дух бьёт Бету «Пепельной стаей»: выбрать бойца (если выбор есть), Бета пасует. */
const openFight = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_06_1',
    playerId: '0',
  });
  // кандидат один — движок выбирает атакующего сам, окна выбора нет
  return opened.combat.stage === 'attacker'
    ? runAction(opened, { type: 'PICK', kind: 'fighter', id: 'ash_1', playerId: '0' })
    : opened;
};

const fight = state => runAction(openFight(state), { type: 'UI_OK', playerId: '1' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

const handIds = state => hand(player(state, '0')).map(entry => entry.id);

describe('карта ifrit_06 «Пепельная стая»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual([
      'duringCombat',
      'duringCombat',
      'afterCombat',
    ]);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'hybrid',
      value: 2,
      bonus: 2,
      quantity: 3,
      fighter: 'ash',
    });
    // тиры взаимоисключающие: 3 духа — +2, 2 духа — +1, 1 дух — добор после боя
    expect(card.rules[0].when[0].params).toMatchObject({ group: 'ash', min: 3, max: 3 });
    expect(card.rules[1].when[0].params).toMatchObject({ group: 'ash', min: 2, max: 2 });
    expect(card.rules[2].when[0].params).toMatchObject({ group: 'ash', min: 1, max: 1 });
    expect(card.rules[0].then[0]).toMatchObject({ action: 'SET_COMBAT', delta: 2 });
    expect(card.rules[1].then[0]).toMatchObject({ action: 'SET_COMBAT', delta: 1 });
    expect(card.rules[2].then[0]).toMatchObject({ action: 'SET_CARDS', op: 'draw', count: 1 });
  });

  it('карта открывает выбор атакующего: духов трое, значит выбирает игрок', () => {
    const opened = runAction(buildState(), {
      type: 'PICK',
      kind: 'card',
      id: 'ifrit_06_1',
      playerId: '0',
    });

    expect(opened.combat.stage).toBe('attacker');
    expect(opened.combat.attackerFighterId).toBeNull();
  });

  it('три живых духа — значение +2, атака 4', () => {
    const after = fight(buildState({ spirits: [1, 2, 3] }));

    expect(after.lastCombat.attackValue).toBe(4);
    expect(after.lastCombat.combatDamage).toBe(4);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(10);
    // добора не было: тир «один дух» не сработал
    expect(handIds(after)).toEqual([]);
  });

  it('два живых духа — значение +1, атака 3', () => {
    const after = fight(buildState({ spirits: [1, 2] }));

    expect(after.lastCombat.attackValue).toBe(3);
    expect(after.lastCombat.combatDamage).toBe(3);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(11);
    expect(handIds(after)).toEqual([]);
  });

  it('один живой дух — прибавки нет, после битвы добор 1 карты', () => {
    const after = fight(buildState({ spirits: [1] }));

    expect(after.lastCombat.attackValue).toBe(2);
    expect(after.lastCombat.combatDamage).toBe(2);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(12);
    // верх колоды (deck_2) ушёл в руку
    expect(handIds(after)).toEqual(['deck_2']);
  });

  it('дух бьёт в защиту: число карты не растёт, добор идёт после битвы', () => {
    // Бета защищается картой 3: дух не пробивает защиту, но правило «остался один дух» всё равно
    // срабатывает — оно смотрит на живых, а не на исход боя
    const state = buildState({ spirits: [1], deckCards: [deckCard(1)] });
    player(state, '1').hand = zone([
      {
        id: 'beta_def',
        instanceId: 'beta_def_1',
        type: 'defense',
        value: 3,
        bonus: 1,
        fighter: 'beta',
      },
    ]);

    const after = runAction(openFight(state), {
      type: 'PICK',
      kind: 'card',
      id: 'beta_def_1',
      playerId: '1',
    });

    expect(after.lastCombat.defenseValue).toBe(3);
    expect(after.lastCombat.attackValue).toBe(2);
    expect(after.lastCombat.winner).toBe('defender');
    expect(player(after, '0').fighters.map(entry => entry.id)).toEqual(['ifrit', 'ash_1']);
    expect(handIds(after)).toEqual(['deck_1']);
  });
});
