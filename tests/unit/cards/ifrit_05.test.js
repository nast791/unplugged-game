import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, deck, discard, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_05');

/** Линия 1—2—3: Ифрит на 2, Бета на 3 (бьёт вплотную). */
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

const deckCard = index => ({
  id: `deck_${index}`,
  instanceId: `deck_${index}`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

const slot = (id, name, order, fighters, hand = [], deckCards = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone(deckCards),
  hand: zone(hand),
  discard: zone([]),
  fighters,
});

/** Бета бьёт Ифрита на 5; у Ифрита в руке «Пепельный щит», в колоде — `deckCards`. */
const buildState = ({ deckCards = [deckCard(1), deckCard(2)] } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 2, 14)],
        [{ ...card, instanceId: 'ifrit_05_1' }],
        deckCards,
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 3, 14)],
        [
          {
            id: 'beta_atk',
            instanceId: 'beta_atk_1',
            type: 'attack',
            value: 5,
            bonus: 1,
            fighter: 'beta',
          },
        ],
      ),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Бета объявляет атаку (Ифрит — единственная цель, защита сразу), Ифрит защищается щитом. */
const defend = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'beta_atk_1',
    playerId: '1',
  });
  return runAction(opened, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_05_1',
    playerId: '0',
  });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_05 «Пепельный щит»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('immediately');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'defense',
      value: 3,
      bonus: 2,
      quantity: 2,
      fighter: 'ifrit',
    });
    // цена — карта колоды: без колоды свойство не предлагается
    expect(card.rules[0].when).toHaveLength(1);
    expect(card.rules[0].when[0]).toMatchObject({ fact: 'DECK', params: { min: 1 } });
    expect(card.rules[0].then.map(step => step.action)).toEqual(['SET_CARDS', 'SET_COMBAT']);
  });

  it('верхняя карта колоды уходит в сброс, а защита растёт до 5', () => {
    const after = defend(buildState());

    // верх колоды — конец массива: ушла deck_2, deck_1 остался
    expect(deck(player(after, '0')).map(entry => entry.id)).toEqual(['deck_1']);
    expect(discard(player(after, '0')).map(entry => entry.id)).toEqual(['deck_2', 'ifrit_05']);
    // 3 + 2 = 5 против атаки 5: урона нет
    expect(after.lastCombat.defenseValue).toBe(5);
    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(0);
    expect(after.lastCombat.winner).toBe('defender');
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(14);
  });

  it('колода из одной карты: она уходит в сброс, защита всё равно 5', () => {
    const after = defend(buildState({ deckCards: [deckCard(7)] }));

    expect(deck(player(after, '0'))).toEqual([]);
    expect(discard(player(after, '0')).map(entry => entry.id)).toEqual(['deck_7', 'ifrit_05']);
    expect(after.lastCombat.defenseValue).toBe(5);
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(14);
  });

  // Правило смотрит на факт DECK: платить нечем — свойство не срабатывает, прибавки нет.
  it('пустая колода — цена не уплачена, защита остаётся 3 и прибавки нет', () => {
    const after = defend(buildState({ deckCards: [] }));

    expect(after.lastCombat.defenseValue).toBe(3);
    // 3 против атаки 5: 2 урона по Ифриту
    expect(after.lastCombat.combatDamage).toBe(2);
    expect(after.lastCombat.winner).toBe('attacker');
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(12);
    // топлива в сбросе нет: единственная карта — сам щит
    expect(discard(player(after, '0')).map(entry => entry.id)).toEqual(['ifrit_05']);
  });
});
