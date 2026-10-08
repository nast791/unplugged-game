import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, fighter, hand, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_12');

/** Линия 1—2—3—4: Ифрит на 2, есть куда шагнуть. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3], terrain: 'ice' },
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
  startHp: extra.startHp ?? hp,
  ...extra,
});

const deckCard = index => ({
  id: `deck_${index}`,
  instanceId: `deck_${index}`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

const slot = (id, name, order, fighters, hand = [], deckCards = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone(deckCards),
  hand: zone(hand),
  discard: zone([]),
  fighters,
});

/** Ифрит на 2 со 10 из 14 здоровья держит «Три обещания»; в колоде две карты. */
const buildState = ({ deckCards = [deckCard(1), deckCard(2)] } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 2, 10, { attackRange: 3, startHp: 14 })],
        [{ ...card, instanceId: 'ifrit_12_1' }],
        deckCards,
      ),
      slot('1', 'Бета', 2, [unit('beta', 1, 14)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const play = state =>
  runAction(state, { type: 'PICK', kind: 'card', id: 'ifrit_12_1', playerId: '0' });

const pick = (state, optionId) =>
  runAction(state, { type: 'PICK', kind: 'option', id: optionId, playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_12 «Три обещания»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['effect', 'picked', 'picked', 'picked']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'effect',
      value: null,
      bonus: 1,
      quantity: 3,
      fighter: 'ifrit',
    });
    expect(card.options.map(option => option.id)).toEqual(['heal', 'draw', 'step']);
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_TARGETING',
      kind: 'options',
      candidates: ['heal', 'draw', 'step'],
      count: 1,
      required: true,
    });
    // у каждого варианта своя ветка picked
    expect(card.rules.slice(1).map(rule => rule.when[0].params)).toEqual([
      { is: 'heal' },
      { is: 'draw' },
      { is: 'step' },
    ]);
  });

  it('окно обязательное: три варианта, отказ невозможен', () => {
    const played = play(buildState());

    expect(played.turn.actionsLeft).toBe(1);
    expect(played.targeting).toMatchObject({ playerId: '0', kind: 'options', required: true });
    expect(played.targeting.candidates.map(entry => entry.optionId)).toEqual([
      'heal',
      'draw',
      'step',
    ]);
    // у обязательного окна общей кнопки отказа нет: ui её не показывает
    expect(runUi(played, '0').controls.ok).toMatchObject({ visible: false, enabled: false });
  });

  it('вариант heal — 2 здоровья Ифриту', () => {
    const after = pick(play(buildState()), 'heal');

    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(12);
    expect(hand(player(after, '0'))).toEqual([]);
    expect(after.movement ?? null).toBeNull();
    expect(after.targeting ?? null).toBeNull();
  });

  it('вариант draw — 2 карты из колоды', () => {
    const after = pick(play(buildState()), 'draw');

    // добор идёт с верха колоды (конец массива), поэтому в руке deck_2, потом deck_1
    expect(hand(player(after, '0')).map(entry => entry.id)).toEqual(['deck_2', 'deck_1']);
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(10);
    expect(after.movement ?? null).toBeNull();
  });

  it('вариант step — перемещение Ифрита до 2 клеток', () => {
    const after = pick(play(buildState()), 'step');

    expect(after.movement).toMatchObject({
      playerId: '0',
      budget: 2,
      optional: true,
      fighters: ['ifrit'],
    });
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(10);
    expect(hand(player(after, '0'))).toEqual([]);
  });

  it('варианты дают именно своё: heal не двигает и не добирает', () => {
    const after = pick(play(buildState()), 'heal');

    // сравнение с двумя другими вариантами на том же состоянии
    const drew = pick(play(buildState()), 'draw');
    const stepped = pick(play(buildState()), 'step');

    expect(after.movement ?? null).toBeNull();
    expect(hand(player(after, '0'))).toEqual([]);
    expect(hand(player(drew, '0'))).toHaveLength(2);
    expect(drew.movement ?? null).toBeNull();
    expect(stepped.movement).not.toBeNull();
    expect(stepped.targeting ?? null).toBeNull();
  });

  it('после выбора шага можно уйти на две клетки и закончить эффект', () => {
    const after = pick(play(buildState()), 'step');
    const stepped = runAction(after, {
      type: 'PICK',
      kind: 'cell',
      id: '4',
      fighterId: 'ifrit',
      playerId: '0',
    });
    const closed = runAction(stepped, { type: 'UI_OK', playerId: '0' });

    expect(String(fighterOf(closed, '0', 'ifrit').currentPosition)).toBe('4');
    expect(closed.movement ?? null).toBeNull();
    expect(closed.effect ?? null).toBeNull();
  });

  it('вариант heal не поднимает здоровье выше startHp', () => {
    const state = buildState();
    player(state, '0').fighters[0] = unit('ifrit', 2, 13, { attackRange: 3, startHp: 14 });

    const after = pick(play(state), 'heal');

    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(14);
  });
});
