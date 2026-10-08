import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
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
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 14)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

  if (lost.length) player(state, '0').lost = lost.map(deadSpirit);
  return state;
};

/** Ифрит объявляет атаку, Бета пасует: дальше идёт окно «мгновенно». */
const openBattle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_04_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

/** Клик по подсвеченному духу в окне, которое открыла карта боя. */
const burn = (state, fighterId) =>
  runAction(state, { type: 'PICK', kind: 'fighter', id: fighterId, playerId: '0' });

/** Отказ от необязательного окна общей кнопкой. */
const decline = state => runAction(state, { type: 'UI_OK', playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

const aliveIds = state => player(state, '0').fighters.map(entry => entry.id);
const lostIds = state => (player(state, '0').lost ?? []).map(entry => entry.id);

describe('карта ifrit_04 «Плата пеплом»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['immediately', 'picked']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'attack',
      value: 3,
      bonus: 1,
      quantity: 3,
      fighter: 'ifrit',
    });
    // окно вариантов заменено окном бойцов: вариантов у карты больше нет
    expect(card.options).toBeUndefined();
    expect(card.rules[0].when[0]).toMatchObject({
      fact: 'FIGHTERS',
      params: { side: 'self', group: 'ash', min: 1 },
      var: 'spirits',
    });
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_TARGETING',
      op: 'open',
      candidates: '$spirits',
      count: 1,
      required: false,
      auto: true,
    });
    expect(card.rules[1].when[0]).toMatchObject({ fact: 'PICKED', var: 'picked' });
    expect(card.rules[1].then.map(step => step.action)).toEqual(['SET_HEALTH', 'SET_COMBAT']);
  });

  it('жив хоть один дух — открывается необязательное окно по живым духам', () => {
    const state = openBattle(buildState());

    expect(state.combat.stage).toBe('reveal');
    expect(state.targeting).toMatchObject({
      playerId: '0',
      kind: 'fighters',
      required: false,
      auto: true,
    });
    expect(state.targeting.candidates.map(entry => entry.fighterId)).toEqual([
      'ash_1',
      'ash_2',
      'ash_3',
    ]);
    // подсветка окна — ровно живые духи, клик по ним разрешён
    expect(runUi(state, '0').highlightedFighterIds.sort()).toEqual(['ash_1', 'ash_2', 'ash_3']);
    expect(runUi(state, '0').pickFighters).toBe(true);
    // окно необязательное: работает общая кнопка завершения, вопросов «жечь или нет» нет
    expect(runUi(state, '0').controls.ok).toMatchObject({
      visible: true,
      enabled: true,
      label: 'Закончить эффект',
    });
    // шаг очереди эффектов ждёт решения игрока
    expect(state.combat.effects.map(entry => entry.status)).toEqual(['waiting']);
  });

  it('выбранный дух умирает, значение карты растёт на 1', () => {
    const after = burn(openBattle(buildState()), 'ash_2');

    // умер именно выбранный, а не «первый живой»
    expect(aliveIds(after)).toEqual(['ifrit', 'ash_1', 'ash_3']);
    expect(lostIds(after)).toEqual(['ash_2']);
    // 3 + 1 = 4 урона по Бете
    expect(after.lastCombat.attackValue).toBe(4);
    expect(after.lastCombat.combatDamage).toBe(4);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(10);
    expect(after.targeting ?? null).toBeNull();
  });

  it('можно сжечь любого духа, а не только первого', () => {
    const after = burn(openBattle(buildState()), 'ash_3');

    expect(aliveIds(after)).toEqual(['ifrit', 'ash_1', 'ash_2']);
    expect(lostIds(after)).toEqual(['ash_3']);
    expect(after.lastCombat.attackValue).toBe(4);
  });

  // Отказ от необязательного окна: общая кнопка закрывает окно, помечает шаг `declined`, дух остаётся
  // жив, значение карты не растёт, бой доигрывается обычным порядком.
  it('отказ от окна: дух цел, прибавки нет, бой доигрывается', () => {
    const state = openBattle(buildState());

    expect(runUi(state, '0').controls.ok).toMatchObject({
      visible: true,
      enabled: true,
      label: 'Закончить эффект',
    });

    const after = decline(state);

    expect(aliveIds(after)).toEqual(['ifrit', 'ash_1', 'ash_2', 'ash_3']);
    expect(lostIds(after)).toEqual([]);
    // 3 без прибавки: Бета получает 3 урона, бой закрыт
    expect(after.lastCombat.attackValue).toBe(3);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(11);
    expect(after.targeting ?? null).toBeNull();
  });

  it('один живой дух — окна не видно, движок отмечает его сам', () => {
    const after = openBattle(buildState({ spirits: [2], lost: [1, 3] }));

    // окно закрылось само: кандидат один
    expect(after.targeting ?? null).toBeNull();
    expect(after.combat ?? null).toBeNull();
    expect(aliveIds(after)).toEqual(['ifrit']);
    expect(lostIds(after)).toEqual(['ash_1', 'ash_3', 'ash_2']);
    expect(after.lastCombat.attackValue).toBe(4);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(10);
  });

  it('духов нет — окна нет вовсе, атака идёт без свойства', () => {
    const state = openBattle(buildState({ spirits: [], lost: [1, 2, 3] }));

    expect(state.targeting ?? null).toBeNull();
    expect(state.combat ?? null).toBeNull();
    expect(state.lastCombat.attackValue).toBe(3);
    expect(lostIds(state)).toEqual(['ash_1', 'ash_2', 'ash_3']);
    expect(fighterOf(state, '1', 'beta').currentHp).toBe(11);
  });

  it('клик мимо подсветки отклоняется, окно остаётся открытым', () => {
    const state = openBattle(buildState());

    // Бета — не дух, в кандидатах окна её нет
    expect(() => burn(state, 'beta')).toThrow(/не среди кандидатов/);
    expect(state.targeting?.candidates.map(entry => entry.fighterId)).toEqual([
      'ash_1',
      'ash_2',
      'ash_3',
    ]);
  });
});
