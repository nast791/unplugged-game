import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/gameEngine.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = medusaCards.find(entry => entry.id === 'medusa_03');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], areas: ['#blue'] },
    { id: 2, neighbors: [1], areas: ['#blue'] },
  ],
};

const zone = cards => ({ visibility: [], cards });

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

/** Бета (игрок 1) атакует Медузу (игрок 0); у неё в руке medusa_03, у Беты — её рука. */
const battleState = (enemyHand = []) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot('0', 'Медуза', 1, [hero('medusa', 1, 16)], [
        { ...card, instanceId: 'medusa_03_1' },
      ]),
      slot('1', 'Бета', 2, [hero('beta', 2, 13)], [
        handCard('batk', 'attack'),
        ...enemyHand,
      ]),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Бета объявляет атаку по Медузе: карта объявлена, цель выбрана, ждём защиту. */
const declareAttack = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'batk_1',
    playerId: '1',
  });
  return runAction(opened, {
    type: 'PICK',
    kind: 'fighter',
    id: 'medusa',
    playerId: '1',
  });
};

/** Медуза защищается картой medusa_03 — после боя должен сработать её эффект. */
const answerDefense = state =>
  runAction(declareAttack(state), {
    type: 'PICK',
    kind: 'card',
    id: 'medusa_03_1',
    playerId: '0',
  });

const handIds = (state, playerId) =>
  player(state, playerId).hand.cards.map(entry => entry.id);

describe('карта medusa_03 «Шепот змей»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
  });

  it('после боя враг сам сбрасывает 1 карту: окно выбора у него, а не у владельца карты', () => {
    const state = answerDefense(battleState([handCard('spare'), handCard('other')]));

    // защита 4 против атаки 0 (batk без value) — бой позади, эффект ждёт решения врага
    expect(state.combat.choice.playerId).toBe('1');
    expect(state.combat.choice.effect).toBe('discard');
    expect(state.combat.choice.max).toBe(1);
    expect(state.combat.choice.optional).toBe(false);
    expect(state.combat.choice.candidates).toEqual([
      { cardId: 'spare_1', bonus: 1 },
      { cardId: 'other_1', bonus: 1 },
    ]);
    expect(state.combat.effects).toEqual([
      {
        order: 1,
        moment: 'afterCombat',
        side: 'defender',
        cardId: 'medusa_03_1',
        playerId: '0',
        status: 'waiting',
      },
    ]);

    // выбирает враг: у него подсвечена его рука, у Медузы ходов нет
    expect(runUi(state, '1').playableCardIds).toEqual(['spare_1', 'other_1']);
    expect(runUi(state, '0').controls.ok.visible).toBe(false);
    expect(runUi(state, '0').playableCardIds).toEqual([]);

    const after = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'spare_1',
      playerId: '1',
    });

    expect(after.combat).toBeNull();
    expect(handIds(after, '1')).toEqual(['other']);
    expect(player(after, '1').discard.cards.map(entry => entry.id)).toEqual([
      'spare',
      'batk',
    ]);
  });

  it('от обязательного сброса нельзя отказаться: кнопка неактивна', () => {
    const state = answerDefense(battleState([handCard('spare')]));

    // ничего не выбрано и отказаться нельзя — общая кнопка выключена
    expect(runUi(state, '1').controls.ok.enabled).toBe(false);
    expect(() => runAction(state, { type: 'UI_OK', playerId: '1' })).toThrow(
      /нельзя отказаться/,
    );

    // выбрал карту — сброс обязателен и без дополнительных подтверждений
    const after = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'spare_1',
      playerId: '1',
    });
    expect(player(after, '1').discard.cards.map(entry => entry.id)).toEqual([
      'spare',
      'batk',
    ]);
  });

  it('если у врага нет карт в руке, эффект просто игнорируется', () => {
    const state = answerDefense(battleState());

    // окна нет и бой закрылся сразу: никаких штрафов и обязательств
    expect(state.combat).toBeNull();
    expect(handIds(state, '1')).toEqual([]);
    expect(state.hook).toBe(PHASES.turn);
    expect(player(state, '1').fighters).toHaveLength(1);
  });
});
