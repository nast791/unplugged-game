import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_09');

/** Линия 1—2—3: Ифрит на 2, Бета на 3. */
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
  // предел здоровья задаётся отдельно: SET_HEALTH не лечит выше startHp
  startHp: extra.startHp ?? hp,
  ...extra,
});

const spirit = (index, cell) =>
  unit(`ash_${index}`, cell, 1, {
    name: `Пепельный дух ${index}`,
    type: 'assistant',
    group: 'ash',
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
 * Ифрит на 2 со 10 hp держит «Пепельный покров» (3), рядом может стоять дух на 3.
 * Бета на 3; `betaHand` — её карты (защита для случая поражения).
 */
const buildState = ({ withSpirit = false, betaHand = [] } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [
          unit('ifrit', 2, 10, { attackRange: 3, startHp: 14 }),
          // дух стоит на 1: в битве он не участвует, но остаётся живым бойцом на поле
          ...(withSpirit ? [spirit(1, 1)] : []),
        ],
        [{ ...card, instanceId: 'ifrit_09_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 14)], betaHand),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Ифрит бьёт Бету «Пепельным покровом» (3): Бета пасует. */
const openBattle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_09_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_09 «Пепельный покров»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('afterCombat');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'hybrid',
      value: 3,
      bonus: 1,
      quantity: 2,
      fighter: 'any',
    });
    expect(card.rules[0].when[0]).toMatchObject({ fact: 'COMBAT', params: { winner: 'self' } });
    expect(card.rules[0].when[1]).toMatchObject({
      fact: 'COMBAT',
      params: { select: 'self' },
      var: 'ours',
    });
    expect(card.rules[0].then[0]).toMatchObject({ action: 'SET_HEALTH', delta: 1 });
  });

  it('после победы боец, участвовавший в битве, лечится на 1', () => {
    const after = openBattle(buildState());

    expect(after.lastCombat.winner).toBe('attacker');
    // Ифрит ударил на 3 — сам он в бою не пострадал, но свойство лечит участника
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(11);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(11);
  });

  it('лечится именно участник боя, а не любой свой боец', () => {
    // дух стоит рядом, но в битве не участвовал: лечение достаётся Ифриту
    const after = openBattle(buildState({ withSpirit: true }));

    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(11);
    // дух цел (1 hp — верхний предел, лечение ничего не меняет)
    expect(fighterOf(after, '0', 'ash_1').currentHp).toBe(1);
  });

  it('при поражении лечения нет', () => {
    // Бета защищается картой 10: 3 против 10 — побеждает защитник, свойство молчит
    const state = buildState({
      betaHand: [
        {
          id: 'beta_def',
          instanceId: 'beta_def_1',
          type: 'defense',
          value: 10,
          bonus: 1,
          fighter: 'beta',
        },
      ],
    });

    const opened = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'ifrit_09_1',
      playerId: '0',
    });
    const after = runAction(opened, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_def_1',
      playerId: '1',
    });

    expect(after.lastCombat.defenseValue).toBe(10);
    expect(after.lastCombat.winner).toBe('defender');
    expect(after.lastCombat.combatDamage).toBe(0);
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(10);
  });

  it('играется и в защиту: победа защитника лечит защищавшегося', () => {
    // Бета бьёт на 2, Ифрит защищается Покровом (3) — побеждает защитник и лечится
    const state = buildState({
      betaHand: [
        {
          id: 'beta_atk',
          instanceId: 'beta_atk_1',
          type: 'attack',
          value: 2,
          bonus: 1,
          fighter: 'beta',
        },
      ],
    });
    state.turn = { ...state.turn, playerId: '1', actedRound: ['1'] };

    const opened = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });
    const after = runAction(opened, {
      type: 'PICK',
      kind: 'card',
      id: 'ifrit_09_1',
      playerId: '0',
    });

    expect(after.lastCombat.winner).toBe('defender');
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(11);
  });

  it('лечение не поднимает здоровье выше startHp', () => {
    const state = buildState();
    // Ифрит на полном здоровье: лечение не должно вывести за предел 14
    player(state, '0').fighters[0] = unit('ifrit', 2, 14, { attackRange: 3, startHp: 14 });

    const after = openBattle(state);

    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(14);
  });
});
