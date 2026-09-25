import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/gameEngine.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = medusaCards.find(entry => entry.id === 'medusa_05');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], areas: ['#blue'] },
    { id: 2, neighbors: [1], areas: ['#blue'] },
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

const handCard = (id, type = 'effect') => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type,
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

/**
 * Медуза (игрок 0, защищается «Капканом») против Беты (игрок 1, атакует).
 * «Капкан» — hybrid, поэтому играется любой стороной; проверяем игру со стороны защитника.
 */
const state = (enemyHand = []) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [
          unit('medusa', 1, 16, { attackType: 'ranged' }),
          unit('harpies_1', 2, 1, { type: 'assistant', group: 'harpies' }),
        ],
        [{ ...card, instanceId: 'medusa_05_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 2, 13, { attackType: 'ranged' })], [
        {
          id: 'beta_atk',
          instanceId: 'beta_atk_1',
          type: 'attack',
          value: 3,
          bonus: 1,
          fighter: 'beta',
        },
        ...enemyHand,
      ]),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const answerDefense = (enemyHand = []) => {
  let battle = runAction(state(enemyHand), {
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
  return runAction(battle, {
    type: 'PICK',
    kind: 'card',
    id: 'medusa_05_1',
    playerId: '0',
  });
};

describe('карта medusa_05 «Капкан»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
  });

  it('атаковавший враг сбрасывает 1 карту сам', () => {
    const paused = answerDefense([handCard('spare'), handCard('other')]);

    expect(paused.combat.choice.playerId).toBe('1');
    expect(paused.combat.choice.effect).toBe('discard');
    expect(paused.combat.choice.max).toBe(1);
    expect(paused.combat.effects[0].side).toBe('defender');
    expect(paused.combat.effects[0].status).toBe('waiting');
    expect(runUi(paused, '1').playableCardIds).toEqual(['spare_1', 'other_1']);

    const after = runAction(paused, {
      type: 'PICK',
      kind: 'card',
      id: 'other_1',
      playerId: '1',
    });

    expect(after.combat).toBeNull();
    expect(player(after, '1').discard.cards.map(entry => entry.id)).toEqual([
      'other',
      'beta_atk',
    ]);
    expect(player(after, '1').hand.cards.map(entry => entry.id)).toEqual([
      'spare',
    ]);
  });

  it('пустая рука врага — эффект игнорируется, штрафов нет', () => {
    const after = answerDefense();

    expect(after.combat).toBeNull();
    expect(player(after, '1').hand.cards).toHaveLength(0);
    expect(after.hook).toBe(PHASES.turn);
  });
});
