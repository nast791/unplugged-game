import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runFact } from '#shared/facts/run.js';
import { runAction } from '#shared/publicApi.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_03');

/** Линия 1—2—3: Дороти на 2, Тото на 1 (сосед), Бета на 3. */
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

/** Бета бьёт Дороти; рядом с ней либо стоит Тото (`neighbor`), либо нет. */
const buildState = ({ neighbor = true, attackValue = 5 } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        neighbor
          ? [unit('dorothy', 2, 12), unit('toto', 1, 6, { type: 'assistant', group: 'toto' })]
          : [unit('dorothy', 2, 12)],
        [{ ...card, instanceId: 'dorothy_03_1' }],
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 3, 13)],
        [
          {
            id: 'beta_atk',
            instanceId: 'beta_atk_1',
            type: 'attack',
            value: attackValue,
            bonus: 1,
            fighter: 'beta',
          },
        ],
      ),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Бета объявляет атаку, Дороти защищается «Ни шагу назад». */
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
    id: 'dorothy_03_1',
    playerId: '0',
  });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта dorothy_03 «Ни шагу назад»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('duringCombat');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({ type: 'defense', value: 3, bonus: 2, fighter: 'any' });
    // «рядом свой или союзник по команде» — две ветки «или»
    expect(card.rules[0].any).toHaveLength(2);
  });

  it('во время боя факты видят участников открытого боя', () => {
    const opened = runAction(buildState({ neighbor: true, attackValue: 5 }), {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });

    // итога боя ещё нет, но защищающийся и атакующий уже известны: карта опирается на открытый бой
    expect(opened.combat.stage).toBe('defense');
    expect(opened.lastCombat).toBeNull();
    expect(runFact(opened, 'COMBAT', { select: 'self' }, { playerId: '0' })).toEqual({
      ok: true,
      value: ['dorothy'],
    });
    expect(runFact(opened, 'COMBAT', { select: 'opponent' }, { playerId: '0' })).toEqual({
      ok: true,
      value: ['beta'],
    });
    // условие карты: «рядом с защищающимся стоит свой боец» — Тото на соседней клетке
    expect(
      runFact(
        opened,
        'FIGHTERS',
        { side: 'self', adjacentTo: 'dorothy', min: 1 },
        { playerId: '0' },
      ).value.map(entry => entry.fighterId),
    ).toEqual(['toto']);
  });

  it('рядом стоит свой боец — +2, защита 5 и весь урон погашен', () => {
    const after = battle(buildState({ neighbor: true, attackValue: 5 }));

    expect(after.lastCombat.defenseValue).toBe(5);
    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(0);
    expect(after.lastCombat.winner).toBe('defender');
    expect(fighterOf(after, '0', 'dorothy').currentHp).toBe(12);
  });

  it('соседа нет — карта держит только своё значение, защита 3', () => {
    const alone = battle(buildState({ neighbor: false, attackValue: 3 }));

    expect(alone.lastCombat.defenseValue).toBe(3);
    expect(alone.lastCombat.combatDamage).toBe(0);
    expect(alone.lastCombat.winner).toBe('defender');
    expect(fighterOf(alone, '0', 'dorothy').currentHp).toBe(12);
    // карта защиты ушла в сброс владельца
    expect(player(alone, '0').discard.cards.map(entry => entry.id)).toEqual(['dorothy_03']);

    // то же значение карты, но с живым плечом рядом даёт 5: дело именно в соседе
    const withNeighbor = battle(buildState({ neighbor: true, attackValue: 3 }));

    expect(withNeighbor.lastCombat.defenseValue).toBe(5);
  });
});
