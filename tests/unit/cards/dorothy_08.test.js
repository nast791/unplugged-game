import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_08');

/** Линия 1—2—3—4—5: Дороти на 2, цель — на 3 (единственная соседняя клетка). */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3, 5], terrain: 'ice' },
    { id: 5, neighbors: [4], terrain: 'ice' },
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

/** Дороти против Беты; `target` — герой противника или его помощник на соседней клетке. */
const buildState = ({ assistant = false, assistantHp = 2 } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot('0', 'Дороти', 1, [unit('dorothy', 2, 12)], [{ ...card, instanceId: 'dorothy_08_1' }]),
      slot(
        '1',
        'Бета',
        2,
        assistant
          ? [
              unit('harpies_1', 3, assistantHp, { type: 'assistant', group: 'harpies' }),
              unit('beta', 4, 13),
            ]
          : [unit('beta', 3, 13)],
      ),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Дороти бьёт «Наотмашь»; цель одна, поэтому окна выбора бойца нет, защитник пасует. */
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
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules).toHaveLength(2);
    for (const rule of card.rules) {
      expect(rule.moment).toBe('afterCombat');
      expect(isMoment(rule.moment)).toBe(true);
    }
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({ type: 'attack', value: 3, bonus: 2, fighter: 'dorothy' });
    expect(card.rules[1].when[0]).toMatchObject({
      fact: 'COMBAT',
      params: { select: 'opponent', type: 'assistant' },
    });
  });

  it('бой против героя: 2 урона сверх боя, герою противника добавки нет', () => {
    const after = battle(buildState());

    // бой: 13 − 3 = 10, затем свойство карты — ещё 2
    expect(after.lastCombat.combatDamage).toBe(3);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(8);
  });

  it('бой против помощника: 2 урона ему и 1 урон его герою', () => {
    const after = battle(buildState({ assistant: true, assistantHp: 5 }));

    // помощник: 5 − 3 (бой) − 2 (свойство) = 0, он гибнет, а герой получает 1
    expect(fighterOf(after, '1', 'harpies_1')).toBeUndefined();
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(12);
  });

  it('помощник погиб уже в бою — тип берётся из записи боя, герой всё равно получает 1', () => {
    const after = battle(buildState({ assistant: true, assistantHp: 2 }));

    expect(fighterOf(after, '1', 'harpies_1')).toBeUndefined();
    expect(after.lastCombat.targetType).toBe('assistant');
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(12);
  });
});
