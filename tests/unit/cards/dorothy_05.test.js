import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runFact } from '#shared/facts/run.js';
import { runAction } from '#shared/publicApi.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_05');

/** Линия 1—2—3: Дороти на 2, атакующий на 3. */
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

/** Кто атакует Дороти: герой противника или его помощник. */
const buildState = ({ assistant = false } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot('0', 'Дороти', 1, [unit('dorothy', 2, 12)], [{ ...card, instanceId: 'dorothy_05_1' }]),
      slot(
        '1',
        'Бета',
        2,
        assistant
          ? [unit('beta_pawn', 3, 6, { type: 'assistant', group: 'beta_pawn' })]
          : [unit('beta', 3, 13)],
        [
          {
            id: 'beta_atk',
            instanceId: 'beta_atk_1',
            type: 'attack',
            value: 5,
            bonus: 1,
            fighter: assistant ? 'beta_pawn' : 'beta',
          },
        ],
      ),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Атакующий бьёт Дороти, Дороти защищается «Чужой землёй». */
const battle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'beta_atk_1',
    playerId: '1',
  });
  return runAction(opened, {
    type: 'PICK',
    kind: 'card',
    id: 'dorothy_05_1',
    playerId: '0',
  });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта dorothy_05 «Чужая земля»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('duringCombat');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({ type: 'defense', value: 4, bonus: 2, fighter: 'any' });
  });

  it('во время боя свойство видит атакующего героя и не видит помощника', () => {
    const heroBattle = runAction(buildState({ assistant: false }), {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });

    expect(heroBattle.combat.stage).toBe('defense');
    expect(heroBattle.lastCombat).toBeNull();
    expect(runFact(heroBattle, 'COMBAT', { select: 'opponent' }, { playerId: '0' })).toEqual({
      ok: true,
      value: ['beta'],
    });
    expect(
      runFact(heroBattle, 'FIGHTERS', { fighterIds: ['beta'], type: 'hero' }, { playerId: '0' }).ok,
    ).toBe(true);

    const pawnBattle = runAction(buildState({ assistant: true }), {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });

    expect(runFact(pawnBattle, 'COMBAT', { select: 'opponent' }, { playerId: '0' })).toEqual({
      ok: true,
      value: ['beta_pawn'],
    });
    // помощник под условие «атакует герой противника» не подходит
    expect(
      runFact(
        pawnBattle,
        'FIGHTERS',
        { fighterIds: ['beta_pawn'], type: 'hero', min: 1 },
        { playerId: '0' },
      ).ok,
    ).toBe(false);
  });

  it('атакует герой противника — +1, защита 5 и весь урон погашен', () => {
    const after = battle(buildState({ assistant: false }));

    expect(after.lastCombat.defenseValue).toBe(5);
    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(0);
    expect(after.lastCombat.winner).toBe('defender');
    expect(fighterOf(after, '0', 'dorothy').currentHp).toBe(12);
  });

  it('атакует помощник — бонуса нет, защита 4 и урон проходит', () => {
    const after = battle(buildState({ assistant: true }));

    expect(after.lastCombat.defenseValue).toBe(4);
    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(1);
    expect(after.lastCombat.winner).toBe('attacker');
    expect(fighterOf(after, '0', 'dorothy').currentHp).toBe(11);
  });
});
