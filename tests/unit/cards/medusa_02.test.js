import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/gameEngine.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = medusaCards.find(entry => entry.id === 'medusa_02');

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

const bonusCard = (id, bonus) => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type: 'effect',
  value: 0,
  bonus,
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

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

/** Медуза (игрок 0) бьёт beta картой medusa_02; в руке — extraCards. */
const attackState = (extraCards = []) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot('0', 'Медуза', 1, [hero('medusa', 1, 16)], [
        { ...card, instanceId: 'medusa_02_1' },
        ...extraCards,
      ]),
      slot('1', 'Beta', 2, [hero('beta', 2, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Объявить бой и выбрать цель. */
const openBattle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'medusa_02_1',
    playerId: '0',
  });
  return runAction(opened, {
    type: 'PICK',
    kind: 'fighter',
    id: 'beta',
    playerId: '0',
  });
};

/** Защитник пасует — дальше бой доигрывает движок, останавливаясь на окне эффекта. */
const answerPass = state => runAction(state, { type: 'UI_OK', playerId: '1' });

const effectsOf = state => state.combat?.effects ?? [];

describe('карта medusa_02 «Град стрел»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
  });

  it('усиление: сброс карты с бонусом прибавляет его к атаке до расчёта', () => {
    const state = openBattle(attackState([bonusCard('quiet', 2)]));
    expect(state.combat.stage).toBe('defense');

    const paused = answerPass(state);

    // бой встал на окне усиления: игрок 0 выбирает карту из руки
    expect(paused.combat.choice.playerId).toBe('0');
    expect(paused.combat.choice.side).toBe('attack');
    expect(paused.combat.choice.candidates).toEqual([
      { cardId: 'quiet_1', bonus: 2 },
    ]);
    expect(effectsOf(paused)).toEqual([
      {
        order: 1,
        moment: 'duringCombat',
        side: 'attacker',
        cardId: 'medusa_02_1',
        playerId: '0',
        status: 'waiting',
      },
    ]);

    const boosted = runAction(paused, {
      type: 'PICK',
      kind: 'card',
      id: 'quiet_1',
      playerId: '0',
    });

    // карты кончились — окно закрылось само, дальше бой доигран
    expect(boosted.combat).toBeNull();
    // 3 + 2 = 5 урона, карта усиления в сбросе
    expect(boosted.lastCombat.attackValue).toBe(5);
    expect(boosted.lastCombat.combatDamage).toBe(5);
    expect(boosted.lastCombat.winner).toBe('attacker');
    expect(fighterOf(boosted, '1', 'beta').currentHp).toBe(8);
    // карта усиления и разыгранная карта боя — в сбросе владельца
    expect(player(boosted, '0').discard.cards.map(entry => entry.id)).toEqual([
      'quiet',
      'medusa_02',
    ]);
    expect(player(boosted, '0').hand.cards).toHaveLength(0);
  });

  it('правило с max: 1 — вторая карта остаётся в руке, окно закрывается само', () => {
    const state = openBattle(
      attackState([bonusCard('quiet', 2), bonusCard('loud', 3)]),
    );
    const paused = answerPass(state);
    const queue = paused.combat.effects;
    expect(paused.combat.choice.max).toBe(1);
    expect(paused.combat.choice.candidates).toHaveLength(2);

    const boosted = runAction(paused, {
      type: 'PICK',
      kind: 'card',
      id: 'quiet_1',
      playerId: '0',
    });

    expect(boosted.combat).toBeNull();
    expect(boosted.lastCombat.attackValue).toBe(5);
    expect(boosted.lastCombat.combatDamage).toBe(5);
    expect(queue[0].status).toBe('applied');
    expect(queue[0].cards).toEqual(['quiet_1']);
    expect(player(boosted, '0').hand.cards.map(entry => entry.id)).toEqual([
      'loud',
    ]);
  });

  it('в окне видно только свои карты, чужая рука не подсказывается', () => {
    const state = openBattle(attackState([bonusCard('quiet', 2)]));
    const paused = answerPass(state);

    const mine = runUi(paused, '0');
    expect(mine.playableCardIds).toEqual(['quiet_1']);
    expect(mine.hint).toMatch(/карту для эффекта/i);

    // защитнику окно не показывается и ходов у него нет
    const other = runUi(paused, '1');
    expect(other.playableCardIds).toEqual([]);
    expect(other.controls.ok.visible).toBe(false);
  });

  it('отказ: общая кнопка без выбора пропускает эффект, карта остаётся в руке', () => {
    const state = openBattle(attackState([bonusCard('quiet', 2)]));
    const paused = answerPass(state);
    const controls = runUi(paused, '0').controls;
    expect(controls.ok.enabled).toBe(true);
    expect(controls.ok.label).toBe('Пропустить эффект');
    expect(controls.back.visible).toBe(false);

    const skipped = runAction(paused, { type: 'UI_OK', playerId: '0' });

    expect(skipped.lastCombat.attackValue).toBe(3);
    expect(skipped.lastCombat.combatDamage).toBe(3);
    expect(fighterOf(skipped, '1', 'beta').currentHp).toBe(10);
    expect(player(skipped, '0').hand.cards.map(entry => entry.id)).toEqual([
      'quiet',
    ]);
    expect(player(skipped, '0').discard.cards.map(entry => entry.id)).toEqual([
      'medusa_02',
    ]);
    expect(skipped.combat).toBeNull();
  });

  it('нет карт с бонусом — эффект не срабатывает, бой идёт без паузы', () => {
    const state = openBattle(
      attackState([bonusCard('empty', 0), bonusCard('typed', 0)]),
    );

    const after = answerPass(state);

    expect(after.combat).toBeNull();
    expect(after.lastCombat.attackValue).toBe(3);
    expect(after.lastCombat.combatDamage).toBe(3);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(10);
  });

  it('без карт усиления бой идёт без паузы и заканчивается за одно действие', () => {
    const state = openBattle(attackState());
    // очередь эффектов строится на вскрытии: пока защита не отвечена, её ещё нет
    expect(state.combat.effects).toBeUndefined();

    const after = answerPass(state);
    expect(after.combat).toBeNull();
    expect(after.lastCombat.combatDamage).toBe(3);
  });});
