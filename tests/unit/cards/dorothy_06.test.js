import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_06');

/** Линия 1—2—3: Тото на 1, Бета на 2, Дороти на 3. */
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

/** Пустая карта для ширины руки: значение и тип в условии карты не участвуют. */
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

/** Тото бьёт Бету «Грызёт за пятки»; `extra` — карты руки сверх самой карты боя. */
const buildState = ({
  extra = [filler(1), filler(2), filler(3), filler(4)],
  defense = false,
} = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [unit('dorothy', 3, 12), unit('toto', 1, 6, { type: 'assistant', group: 'toto' })],
        [{ ...card, instanceId: 'dorothy_06_1' }, ...extra],
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 2, 13)],
        defense
          ? [
              {
                id: 'beta_atk',
                instanceId: 'beta_atk_1',
                type: 'attack',
                value: 5,
                bonus: 1,
                fighter: 'beta',
              },
            ]
          : [],
      ),
    ],
    turn: { index: 1, playerId: defense ? '1' : '0', actedRound: [defense ? '1' : '0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Тото атакует Бету; защитник пасует. */
const battle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'dorothy_06_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта dorothy_06 «Грызёт за пятки»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('duringCombat');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({ type: 'hybrid', value: 3, bonus: 1, fighter: 'toto' });
    expect(card.rules[0].when[0]).toMatchObject({ fact: 'HAND', params: { min: 4 } });
  });

  it('в руке 4 карты — +2, атака 5', () => {
    // карта ушла из руки в бой: в руке остаётся ровно четыре карты
    const after = battle(buildState({ extra: [filler(1), filler(2), filler(3), filler(4)] }));

    expect(player(after, '0').hand.cards).toHaveLength(4);
    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(5);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(8);
  });

  it('в руке меньше четырёх — бонуса нет, атака 3', () => {
    const after = battle(buildState({ extra: [filler(1), filler(2)] }));

    expect(player(after, '0').hand.cards).toHaveLength(2);
    expect(after.lastCombat.attackValue).toBe(3);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(10);
  });

  it('в защите карта тоже считается по руке: 3 + 2 = 5', () => {
    // Бета бьёт Тото (он рядом с Дороти), Тото защищается гибридом на широкой руке
    const state = buildState({
      extra: [filler(1), filler(2), filler(3), filler(4)],
      defense: true,
    });
    let run = runAction(state, { type: 'PICK', kind: 'card', id: 'beta_atk_1', playerId: '1' });
    // Бета достаёт и Тото, и Дороти: цель выбирает игрок
    run = runAction(run, { type: 'PICK', kind: 'fighter', id: 'toto', playerId: '1' });
    const after = runAction(run, {
      type: 'PICK',
      kind: 'card',
      id: 'dorothy_06_1',
      playerId: '0',
    });

    expect(after.lastCombat.defenseValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(0);
    expect(after.lastCombat.winner).toBe('defender');
    expect(fighterOf(after, '0', 'toto').currentHp).toBe(6);
  });
});
