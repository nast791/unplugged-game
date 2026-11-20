import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_04');

/** Линия 1—2—3: Ифрит на 2, духи на 1, Бета на 3. */
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

const spirit = (index, cell = 1) =>
  unit(`ash_${index}`, cell, 1, {
    name: `Пепельный дух ${index}`,
    type: 'assistant',
    group: 'ash',
  });

const deadSpirit = index => ({ ...spirit(index, null), currentPosition: null, currentHp: 0 });

const slot = (id, name, order, fighters, hand = [], deck = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone(deck),
  hand: zone(hand),
  discard: zone([]),
  fighters,
});

/** Ифрит на 2 с «Платой пеплом»; `spirits` — живые духи на 1, `lost` — уже убитые. */
const buildState = ({ spirits = [1, 2, 3], lost = [] } = {}) => {
  const state = createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 2, 14, { attackRange: 3 }), ...spirits.map(index => spirit(index))],
        [{ ...card, instanceId: 'ifrit_04_1' }],
        [{ id: 'ifdraw', title: 'Карта колоды', type: 'attack', value: 2, bonus: 1 }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 14)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

  if (lost.length) player(state, '0').lost = lost.map(deadSpirit);
  return state;
};

/** Ифрит объявляет атаку, Бета пасует: свойство мгновенное и автоматическое, окна нет. */
const attack = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_04_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

const aliveIds = state => player(state, '0').fighters.map(entry => entry.id);
const lostIds = state => (player(state, '0').lost ?? []).map(entry => entry.id);
const handIds = (state, playerId = '0') =>
  player(state, playerId).hand.cards.map(entry => entry.id);

describe('карта ifrit_04 «Плата пеплом»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['immediately', 'afterCombat']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'attack',
      value: 4,
      bonus: 3,
      quantity: 3,
      fighter: 'ifrit',
    });
    // свойства-вариантов у карты нет: пепел просто поднимает значение
    expect(card.options).toBeUndefined();
    expect(card.rules[0].when[0]).toMatchObject({
      fact: 'FIGHTERS',
      params: { side: 'self', group: 'ash', min: 1 },
    });
    // «значение этой карты становится 6» — не прибавка, а новое значение
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_COMBAT',
      op: 'value',
      side: 'self',
      to: 6,
    });
    expect(card.rules[1].when[0]).toMatchObject({
      fact: 'COMBAT',
      params: { winner: 'self' },
    });
    expect(card.rules[1].then[0]).toMatchObject({ action: 'SET_CARDS', op: 'draw', count: 1 });
  });

  it('жив хоть один дух — значение становится 6, дух остаётся жив', () => {
    const after = attack(buildState());

    expect(after.lastCombat.attackValue).toBe(6);
    expect(after.lastCombat.combatDamage).toBe(6);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(8);
    // платы нет: духи целы, окно не открывалось
    expect(aliveIds(after)).toEqual(['ifrit', 'ash_1', 'ash_2', 'ash_3']);
    expect(lostIds(after)).toEqual([]);
    expect(after.targeting ?? null).toBeNull();
    // ПОСЛЕ БИТВЫ: победа приносит карту
    expect(handIds(after)).toEqual(['ifdraw']);
  });

  it('один живой дух — по-прежнему 6: важно, что дух жив, а не сколько их', () => {
    const after = attack(buildState({ spirits: [2], lost: [1, 3] }));

    expect(after.lastCombat.attackValue).toBe(6);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(8);
    expect(aliveIds(after)).toEqual(['ifrit', 'ash_2']);
  });

  it('духов нет — свойства нет: атака идёт на 4, окна не открывается', () => {
    const state = attack(buildState({ spirits: [], lost: [1, 2, 3] }));

    expect(state.targeting ?? null).toBeNull();
    expect(state.lastCombat.attackValue).toBe(4);
    expect(fighterOf(state, '1', 'beta').currentHp).toBe(10);
    expect(lostIds(state)).toEqual(['ash_1', 'ash_2', 'ash_3']);
  });

  it('проигранная битва карту не приносит', () => {
    const state = buildState({ spirits: [], lost: [1, 2, 3] });
    // Бета защищается сильной картой: 8 против 4 — побеждает защита
    player(state, '1').hand = zone([
      {
        id: 'beta_big',
        instanceId: 'beta_big_1',
        title: 'Большой щит',
        type: 'defense',
        value: 8,
        bonus: 0,
      },
    ]);
    const attacked = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'ifrit_04_1',
      playerId: '0',
    });
    const after = runAction(attacked, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_big_1',
      playerId: '1',
    });

    expect(after.lastCombat.winner).toBe('defender');
    // ПОСЛЕ БИТВЫ сработало бы только за победу: карта в руку не приходит
    expect(handIds(after)).toEqual([]);
  });
});
