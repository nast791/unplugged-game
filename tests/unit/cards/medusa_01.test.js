import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/gameEngine.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = medusaCards.find(entry => entry.id === 'medusa_01');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], areas: ['#blue'] },
    { id: 2, neighbors: [1, 3], areas: ['#blue'] },
    { id: 3, neighbors: [2], areas: ['#red'] },
  ],
};

const hero = (id, cell, hp) =>
  fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 2,
    attackRange: 1,
  });

const zone = cards => ({ visibility: [], cards });

const slot = (id, name, order, fighters, cards = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone(cards),
  discard: zone([]),
  fighters,
});

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

/** Медуза (игрок 0) бьёт beta (игрок 1) картой medusa_01; у защитника — свои карты. */
const attackState = (defenderCards = []) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot('0', 'Медуза', 1, [hero('medusa', 1, 16)], [
        { ...card, instanceId: 'medusa_01_1' },
      ]),
      slot('1', 'Beta', 2, [hero('beta', 2, 13)], defenderCards),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Довести бой до стадии защиты: объявить карту и выбрать цель. */
const openBattle = (defenderCards = []) => {
  let state = attackState(defenderCards);
  state = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'medusa_01_1',
    playerId: '0',
  });
  state = runAction(state, {
    type: 'PICK',
    kind: 'fighter',
    id: 'beta',
    playerId: '0',
  });
  return state;
};

describe('карта medusa_01 «Взгляд смерти»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
  });

  it('после победы в битве атакованный боец получает 8 урона', () => {
    let state = openBattle();
    expect(state.combat.stage).toBe('defense');

    state = runAction(state, { type: 'UI_OK', playerId: '1' });

    expect(state.lastCombat.winner).toBe('attacker');
    expect(state.lastCombat.combatDamage).toBe(2);
    // 13 − 2 (числа боя) − 8 (эффект карты)
    expect(fighterOf(state, '1', 'beta').currentHp).toBe(3);
    expect(state.combat).toBeNull();
    expect(state.hook).toBe(PHASES.turn);
  });

  it('при проигранной битве урон по карте не наносится', () => {
    const strongDefense = {
      id: 'bdef',
      instanceId: 'bdef_1',
      type: 'defense',
      value: 5,
      bonus: 1,
    };
    let state = openBattle([strongDefense]);
    state = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'bdef_1',
      playerId: '1',
    });

    expect(state.lastCombat.winner).toBe('defender');
    expect(state.lastCombat.combatDamage).toBe(0);
    expect(fighterOf(state, '1', 'beta').currentHp).toBe(13);
  });

  it('эффект карты может добить бойца и завершить партию', () => {
    const state5 = attackState();
    fighterOf(state5, '1', 'beta').currentHp = 5;

    let state = runAction(state5, {
      type: 'PICK',
      kind: 'card',
      id: 'medusa_01_1',
      playerId: '0',
    });
    state = runAction(state, {
      type: 'PICK',
      kind: 'fighter',
      id: 'beta',
      playerId: '0',
    });
    state = runAction(state, { type: 'UI_OK', playerId: '1' });

    expect(player(state, '1').fighters).toHaveLength(0);
    expect(state.hook).toBe(PHASES.gameEnd);
    expect(state.winner).toBe('0');
  });

  it('если атакованный боец погиб от урона боя, 8 урона сгорают', () => {
    const state2 = createState({
      phase: PHASES.turn,
      map: lineMap,
      players: [
        slot('0', 'Медуза', 1, [hero('medusa', 1, 16)], [
          { ...card, instanceId: 'medusa_01_1' },
        ]),
        slot('1', 'Beta', 2, [
          hero('beta', 3, 13),
          fighter({
            id: 'beta_pet',
            name: 'beta_pet',
            type: 'sidekick',
            currentPosition: 2,
            // 2 HP: урон боя (2) убирает помощника с поля до фазы «после боя»
            currentHp: 2,
            move: 2,
            attackRange: 1,
          }),
        ]),
      ],
      turn: { index: 1, playerId: '0', actedRound: ['0'] },
      _enteredHooks: { gameStart: true, turn: true },
    });

    let state = runAction(state2, {
      type: 'PICK',
      kind: 'card',
      id: 'medusa_01_1',
      playerId: '0',
    });
    state = runAction(state, {
      type: 'PICK',
      kind: 'fighter',
      id: 'beta_pet',
      playerId: '0',
    });
    state = runAction(state, { type: 'UI_OK', playerId: '1' });

    expect(state.lastCombat.winner).toBe('attacker');
    expect(state.lastCombat.combatDamage).toBe(2);
    expect(player(state, '1').fighters.map(entry => entry.id)).toEqual(['beta']);
    // урон по карте ушёл в никуда: он не переносится ни на героя, ни на клетку
    expect(fighterOf(state, '1', 'beta').currentHp).toBe(13);
    expect(state.hook).toBe(PHASES.turn);
  });
});
