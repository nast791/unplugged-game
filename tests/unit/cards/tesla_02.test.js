import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = teslaCards.find(entry => entry.id === 'tesla_02');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1], terrain: 'ice' },
  ],
};

const unit = (id, cell, hp, extra = {}) => ({
  ...fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 3,
    attackRange: 1,
  }),
  ...extra,
});

const slot = (id, name, order, fighters, hand = [], deck = [], items = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: { visibility: [], cards: deck },
  hand: { visibility: [], cards: hand },
  discard: { visibility: [], cards: [] },
  fighters,
  items,
});

const coilsOf = (states = ['active', 'active']) =>
  states.map((state, index) => ({
    id: `coil_${index + 1}`,
    group: 'coil',
    name: 'Катушка Теслы',
    copies: 2,
    state,
  }));

const deckCard = index => ({
  id: `deck_${index}`,
  instanceId: `deck_${index}`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

/** Тесла бьёт Бету картой «Низкая частота»; защитник пасует. */
const state = (coilStates = ['active', 'active']) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Тесла',
        1,
        [unit('tesla', 1, 14, { attackRange: 3, startHp: 14 })],
        [{ ...card, instanceId: 'tesla_02_1' }],
        [deckCard(0), deckCard(1)],
        coilsOf(coilStates),
      ),
      slot('1', 'Бета', 2, [unit('beta', 2, 13, { attackRange: 3 })]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const battlePause = (start = state()) => {
  let battle = runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'tesla_02_1',
    playerId: '0',
  });
  battle = runAction(battle, {
    type: 'PICK',
    kind: 'fighter',
    id: 'beta',
    playerId: '0',
  });
  return runAction(battle, { type: 'UI_OK', playerId: '1' });
};

const choose = (pause, optionId) =>
  runAction(pause, { type: 'PICK', kind: 'option', id: optionId, playerId: '0' });

const coilStates = state => player(state, '0').items.map(item => item.state);
const actions = state => state.turn.actionsLeft;
const handSize = state => player(state, '0').hand.cards.length;

describe('карта tesla_02 «Низкая частота»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['afterCombat', 'picked', 'picked']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.options.map(option => option.id)).toEqual(['spend1', 'spend2']);
  });

  it('две активные катушки: предложены оба варианта, отказ доступен', () => {
    const paused = battlePause(state(['active', 'active']));

    const ui = runUi(paused, '0');
    expect(ui.choices.map(choice => choice.optionId)).toEqual(['spend1', 'spend2']);
    // «Вы можете» — свойство необязательное: общая кнопка отказывается от него
    expect(ui.controls.ok.visible).toBe(true);
    expect(ui.controls.ok.enabled).toBe(true);
  });

  it('вариант «одна катушка»: одно действие, карта не добирается', () => {
    const paused = battlePause(state(['active', 'active']));
    const before = actions(paused);

    const after = choose(paused, 'spend1');

    expect(coilStates(after)).toEqual(['inactive', 'active']);
    expect(actions(after)).toBe(before + 1);
    expect(handSize(after)).toBe(0);
    expect(after.combat).toBeNull();
  });

  it('вариант «две катушки»: действие и карта («также» складывается)', () => {
    const paused = battlePause(state(['active', 'active']));
    const before = actions(paused);

    const after = choose(paused, 'spend2');

    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
    expect(actions(after)).toBe(before + 1);
    expect(handSize(after)).toBe(1);
    expect(player(after, '0').deck.cards).toHaveLength(1);
  });

  it('одна активная катушка: доступен только первый вариант', () => {
    const paused = battlePause(state(['active', 'inactive']));

    // вторая ступень видна, но выбрать её нельзя: у варианта не сошлось условие доступности
    const choices = runUi(paused, '0').choices;
    expect(choices.map(choice => choice.optionId)).toEqual(['spend1', 'spend2']);
    expect(choices.map(choice => choice.disabled)).toEqual([false, true]);
    expect(() => choose(paused, 'spend2')).toThrow(/недоступен/);

    const after = choose(paused, 'spend1');
    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
  });

  it('ни одной активной катушки: заплатить нечем, свойство не предлагается', () => {
    const after = battlePause(state(['inactive', 'inactive']));

    expect(after.targeting ?? null).toBeNull();
    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
    expect(after.combat).toBeNull();
  });

  it('отказ: катушки не тратятся, действия не меняются, шаг помечен declined', () => {
    const paused = battlePause(state(['active', 'active']));
    const before = actions(paused);

    const declined = runAction(paused, { type: 'UI_OK', playerId: '0' });

    expect(coilStates(declined)).toEqual(['active', 'active']);
    expect(actions(declined)).toBe(before);
    expect(handSize(declined)).toBe(0);
    expect(declined.lastCombat.effects[0].status).toBe('declined');
    expect(declined.targeting).toBeNull();
    expect(declined.combat).toBeNull();
  });
});
