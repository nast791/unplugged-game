import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, discard, fighter, PHASES, player } from '../../fixtures/state.js';

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

/** Бета бьёт Ифрита на 5; у Ифрита в руке «Пепельный щит». */
const buildState = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot('0', 'Ифрит', 1, [unit('ifrit', 2, 14)], [{ ...card, instanceId: 'ifrit_05_1' }]),
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

/** Плата кликом по подсвеченному Ифриту. */
const pay = state =>
  runAction(state, { type: 'PICK', kind: 'fighter', id: 'ifrit', playerId: '0' });

/** Отказ от свойства общей кнопкой. */
const decline = state => runAction(state, { type: 'UI_OK', playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_05 «Пепельный щит»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['immediately', 'picked']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'defense',
      value: 3,
      bonus: 2,
      quantity: 2,
      fighter: 'ifrit',
    });
    // свойства-вариантов у карты нет: плата берётся кликом по своему герою
    expect(card.options).toBeUndefined();
    expect(card.rules[0].when[0]).toMatchObject({
      fact: 'FIGHTERS',
      params: { fighterIds: ['ifrit'] },
      min: 1,
      var: 'hero',
    });
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_TARGETING',
      op: 'open',
      candidates: '$hero',
      count: 1,
      required: false,
      // плата своим здоровьем — решение игрока: движок её не выбирает сам
      manual: true,
    });
    expect(card.rules[1].when[0]).toMatchObject({ fact: 'PICKED', var: 'picked' });
    expect(card.rules[1].then.map(step => step.action)).toEqual(['SET_HEALTH', 'SET_COMBAT']);
    expect(card.rules[1].then[0]).toMatchObject({ action: 'SET_HEALTH', delta: -1 });
    // «значение карты +3» — прибавка к текущему значению защиты
    expect(card.rules[1].then[1]).toMatchObject({
      action: 'SET_COMBAT',
      op: 'value',
      side: 'self',
      delta: 3,
    });
  });

  it('щит открывает необязательное окно на самом Ифрите', () => {
    const state = defend(buildState());

    expect(state.targeting).toMatchObject({ playerId: '0', kind: 'fighters', required: false });
    expect(state.targeting.candidates.map(entry => entry.fighterId)).toEqual(['ifrit']);
    expect(runUi(state, '0').highlightedFighterIds).toEqual(['ifrit']);
    expect(runUi(state, '0').pickFighters).toBe(true);
    // «Можете»: общая кнопка отказывается от свойства и доигрывает бой
    expect(runUi(state, '0').controls.ok).toMatchObject({
      visible: true,
      enabled: true,
      label: 'Закончить эффект',
    });
  });

  it('клик по Ифриту: −1 здоровье, защита 3 + 3 = 6, урона нет', () => {
    const after = pay(defend(buildState()));

    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(13);
    expect(after.lastCombat.defenseValue).toBe(6);
    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(0);
    expect(after.lastCombat.winner).toBe('defender');
    expect(discard(player(after, '0')).map(entry => entry.id)).toEqual(['ifrit_05']);
  });

  it('отказ: здоровье целое, защита остаётся 3 и Ифрит получает 2 урона', () => {
    const after = decline(defend(buildState()));

    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(12);
    expect(after.lastCombat.defenseValue).toBe(3);
    expect(after.lastCombat.combatDamage).toBe(2);
    expect(after.lastCombat.winner).toBe('attacker');
    expect(after.targeting ?? null).toBeNull();
  });

  it('плату можно и не подтверждать: окно ждёт решения игрока', () => {
    const state = defend(buildState());

    // до клика значение защиты не менялось и здоровье цело
    expect(state.combat.defenseValue).toBe(3);
    expect(fighterOf(state, '0', 'ifrit').currentHp).toBe(14);
    expect(state.combat.effects.map(entry => entry.status)).toEqual(['waiting']);
  });
});
