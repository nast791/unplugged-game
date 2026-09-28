import { describe, expect, it } from 'vitest';
import { SET_REVEAL } from '#shared/actions/reveal.js';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/gameEngine.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = teslaCards.find(entry => entry.id === 'tesla_05');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'arcane' },
    { id: 2, neighbors: [1], terrain: 'arcane' },
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

/** Верхняя карта колоды Беты: раскрывается она, в сброс уходит она же, бонус 3 идёт в усиление. */
const topCard = (bonus = 3) => ({
  id: 'beta_top',
  instanceId: 'beta_top_1',
  title: 'Верхняя карта',
  type: 'defense',
  value: 2,
  bonus,
});

const state = (coilStates = ['active', 'active'], deck = [topCard()]) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Тесла',
        1,
        [unit('tesla', 1, 14, { attackType: 'ranged', startHp: 14 })],
        [{ ...card, instanceId: 'tesla_05_1' }],
        [],
        coilsOf(coilStates),
      ),
      slot('1', 'Бета', 2, [unit('beta', 2, 13, { attackType: 'ranged' })], [], deck),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Тесла бьёт Бету «Рентгеновским излучением»; Бета пасует — карта раскрыта всем. */
const battlePause = start => {
  let battle = runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'tesla_05_1',
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
const betaDeck = state => player(state, '1').deck.cards.map(entry => entry.id);
const betaDiscard = state => player(state, '1').discard.cards.map(entry => entry.id);
const reveal = state => state.reveal ?? null;

describe('карта tesla_05 «Рентгеновское излучение»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual([
      'duringCombat',
      'duringCombat',
      'picked',
      'picked',
      'picked',
    ]);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.options.map(option => option.id)).toEqual(['ray1', 'ray2']);
  });

  it('раскрытие публичное: карта остаётся на верху колоды, её видно в слоте reveal', () => {
    const paused = battlePause(state());

    // раскрыть ≠ забрать: карта на месте и придёт в руку при следующем доборе
    expect(betaDeck(paused)).toEqual(['beta_top']);
    expect(reveal(paused)).toHaveLength(1);
    expect(reveal(paused)[0].playerId).toBe('1');
    expect(reveal(paused)[0].cards).toEqual([
      {
        cardId: 'beta_top_1',
        name: 'Верхняя карта',
        value: 2,
        bonus: 3,
      },
    ]);
    expect(paused.combat.stage).toBe('reveal');
    expect(runUi(paused, '0').choices.map(choice => choice.optionId)).toEqual(['ray1', 'ray2']);
  });

  it('одна катушка: раскрытая карта уходит в сброс Беты', () => {
    const after = choose(battlePause(state()), 'ray1');

    expect(coilStates(after)).toEqual(['inactive', 'active']);
    expect(betaDeck(after)).toEqual([]);
    expect(betaDiscard(after)).toEqual(['beta_top']);
    expect(reveal(after)).toBeNull();
    // 4 против защиты 0 — урон по Бете
    expect(after.lastCombat.attackValue).toBe(4);
    expect(player(after, '1').fighters[0].currentHp).toBe(9);
  });

  it('две катушки: карта уходит в сброс, а её бонус усиливает атаку', () => {
    const after = choose(battlePause(state()), 'ray2');

    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
    expect(betaDiscard(after)).toEqual(['beta_top']);
    expect(after.lastCombat.attackValue).toBe(7);
    expect(after.lastCombat.combatDamage).toBe(7);
    expect(player(after, '1').fighters[0].currentHp).toBe(6);
  });

  it('карта без бонуса: усиливать нечего, но сброс всё равно срабатывает', () => {
    const after = choose(battlePause(state(['active', 'active'], [topCard(0)])), 'ray2');

    expect(after.lastCombat.attackValue).toBe(4);
    expect(betaDiscard(after)).toEqual(['beta_top']);
    expect(coilStates(after)).toEqual(['inactive', 'inactive']);
  });

  it('одна активная катушка: доступен только первый вариант', () => {
    const paused = battlePause(state(['active', 'inactive']));

    // вторая ступень видна, но выбрать её нельзя: у варианта не сошлось условие доступности
    const choices = runUi(paused, '0').choices;
    expect(choices.map(choice => choice.optionId)).toEqual(['ray1', 'ray2']);
    expect(choices.map(choice => choice.disabled)).toEqual([false, true]);
    expect(() => choose(paused, 'ray2')).toThrow(/недоступен/);
  });

  it('отказ: карта остаётся на верху колоды, катушки не тратятся', () => {
    const paused = battlePause(state());

    const declined = runAction(paused, { type: 'UI_OK', playerId: '0' });

    expect(coilStates(declined)).toEqual(['active', 'active']);
    expect(betaDeck(declined)).toEqual(['beta_top']);
    expect(betaDiscard(declined)).toEqual([]);
    expect(declined.lastCombat.attackValue).toBe(4);
    // снимок раскрытого живёт до конца боя и снимается вместе с ним
    expect(reveal(declined)).toBeNull();
  });

  it('пустая колода противника: раскрывать нечего — свойство не предлагается', () => {
    const after = battlePause(state(['active', 'active'], []));

    expect(after.targeting ?? null).toBeNull();
    expect(coilStates(after)).toEqual(['active', 'active']);
    expect(after.combat).toBeNull();
  });

  it('Тесла защищается этой картой: противник — атакующий, бонус идёт в защиту карты', () => {
    const attacker = createState({
      phase: PHASES.turn,
      map: lineMap,
      players: [
        slot(
          '0',
          'Тесла',
          1,
          [unit('tesla', 1, 14, { attackType: 'ranged', startHp: 14 })],
          [{ ...card, instanceId: 'tesla_05_1' }],
          [],
          coilsOf(),
        ),
        slot(
          '1',
          'Бета',
          2,
          [unit('beta', 2, 13, { attackType: 'ranged' })],
          [
            {
              id: 'beta_atk',
              instanceId: 'beta_atk_1',
              title: 'Наскок',
              type: 'attack',
              value: 5,
              bonus: 1,
              fighter: 'beta',
            },
          ],
          [topCard()],
        ),
      ],
      turn: { index: 1, playerId: '1', actedRound: ['1'] },
      _enteredHooks: { gameStart: true, turn: true },
    });

    let battle = runAction(attacker, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });
    battle = runAction(battle, {
      type: 'PICK',
      kind: 'fighter',
      id: 'tesla',
      playerId: '1',
    });
    const paused = runAction(battle, {
      type: 'PICK',
      kind: 'card',
      id: 'tesla_05_1',
      playerId: '0',
    });

    // раскрыта колода атакующего: «противник» — тот, чей боец в этой битве против меня
    expect(reveal(paused)[0].playerId).toBe('1');

    const after = choose(paused, 'ray2');

    // раскрытая карта ушла в сброс вместе с разыгранной картой атаки
    expect(player(after, '1').deck.cards).toEqual([]);
    expect(player(after, '1').discard.cards.map(entry => entry.id)).toContain('beta_top');
    expect(after.lastCombat.defenseValue).toBe(7);
    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(0);
    expect(player(after, '0').fighters[0].currentHp).toBe(14);
  });

  it('SET_REVEAL: раскрывать можно только в бою и только один раз', () => {
    const outsideBattle = state();
    expect(() => SET_REVEAL(outsideBattle, { op: 'open', of: '1' })).toThrow(/только в битве/);

    const paused = battlePause(state());
    expect(() => SET_REVEAL(paused, { op: 'open', of: '1' })).toThrow(/уже раскрыта/);

    const after = choose(paused, 'ray1');
    expect(() => SET_REVEAL(after, { op: 'discard', of: '1' })).toThrow(/не раскрыта/);
  });
});
