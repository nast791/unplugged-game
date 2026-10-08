import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { movementDestinations } from '#shared/helpers/turn.js';
import { runAction } from '#shared/publicApi.js';
import teslaCards from '../../../server/content/heroes/tesla/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = teslaCards.find(entry => entry.id === 'tesla_10');

/** Тесла в 1, её напарник в 4, Бета в 2, её помощник в 5, Гамма в 3, клетка 6 свободна. */
const map = {
  id: 'square',
  nodes: [
    { id: 1, neighbors: [2, 5], terrain: 'ice' },
    { id: 2, neighbors: [1, 3, 6], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3, 5], terrain: 'ice' },
    { id: 5, neighbors: [1, 4], terrain: 'ice' },
    // свободная клетка: у бойцов соперника должно быть куда идти, иначе окно не откроется
    { id: 6, neighbors: [2], terrain: 'ice' },
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

const slot = (id, name, order, fighters, hand = [], deck = [], items = [], extra = {}) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: { visibility: [], cards: deck },
  hand: { visibility: [], cards: hand },
  discard: { visibility: [], cards: [] },
  fighters,
  items,
  ...extra,
});

const coilsOf = (states = ['inactive', 'inactive']) =>
  states.map((state, index) => ({
    id: `coil_${index + 1}`,
    group: 'coil',
    name: 'Катушка Теслы',
    copies: 2,
    state,
  }));

/**
 * Тесла против соперников. `teamMode` — партия 2 на 2: напарник Теслы и два соперника;
 * без него — игра на троих (каждый сам за себя). `withOthers: false` — соперников на поле нет.
 */
const state = ({ teamMode = false, withOthers = true } = {}) => {
  const tesla = slot(
    '0',
    'Тесла',
    1,
    [unit('tesla', 1, 14, { attackRange: 3, startHp: 14 })],
    [{ ...card, instanceId: 'tesla_10_1' }],
    [],
    coilsOf(),
    teamMode ? { team: 'red' } : {},
  );

  const others = withOthers
    ? teamMode
      ? [
          // напарник: его бойцы дружественные — их двигать нельзя
          slot('1', 'Напарник', 2, [unit('ally', 4, 12, { attackRange: 3 })], [], [], [], {
            team: 'red',
          }),
          slot(
            '2',
            'Бета',
            3,
            [
              unit('beta', 2, 13, { attackRange: 3 }),
              // помощник соперника заперт (клетки 1, 3 и 4 заняты) — ему двигаться некуда
              unit('beta_ally', 5, 5, { type: 'assistant', group: 'beta' }),
            ],
            [],
            [],
            [],
            { team: 'blue' },
          ),
          // гамма стоит на 3, её соседи 2 и 4 свободны после сдвига напарника
          slot('3', 'Гамма', 4, [unit('gamma', 3, 12, { attackRange: 3 })], [], [], [], {
            team: 'blue',
          }),
        ]
      : [
          slot('1', 'Бета', 2, [unit('beta', 2, 13, { attackRange: 3 })]),
          slot('2', 'Гамма', 3, [unit('gamma', 4, 12, { attackRange: 3 })]),
        ]
    : [slot('1', 'Бета', 2, [unit('beta', null, 13)])];

  return createState({
    phase: PHASES.turn,
    map,
    // формат 2 на 2 движок узнаёт из настроек партии: по нему союзник не считается врагом
    settings: teamMode ? { format: 'teams_2v2' } : {},
    players: [tesla, ...others],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });
};

/** Разыграть эффектную карту: одно действие и карта из руки. */
const play = start =>
  runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'tesla_10_1',
    playerId: '0',
  });

const step = (state, fighterId, cellId) =>
  runAction(state, {
    type: 'PICK',
    kind: 'cell',
    cellId,
    fighterId,
    playerId: '0',
  });

const finish = state => runAction(state, { type: 'UI_OK', playerId: '0' });

const cellOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId).currentPosition;
const actions = state => state.turn.actionsLeft;

describe('карта tesla_10 «Волновое воздействие»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['effect', 'effect']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.options).toBeUndefined();
  });

  it('игра на троих: двигаются бойцы всех остальных игроков, свои — нет', () => {
    const played = play(state());

    expect(played.movement.playerId).toBe('0');
    expect(played.movement.budget).toBe(2);
    expect(played.movement.optional).toBe(true);
    expect(played.movement.fighters.sort()).toEqual(['beta', 'gamma']);
    expect(played.movement.fighters).not.toContain('tesla');
  });

  it('2 на 2: двигаются бойцы обоих соперников, напарника — нельзя', () => {
    const played = play(state({ teamMode: true }));

    expect(played.movement.fighters.sort()).toEqual(['beta', 'beta_ally', 'gamma']);
    expect(played.movement.fighters).not.toContain('ally');
    expect(played.movement.fighters).not.toContain('tesla');
    // «некуда идти» проверяется по шагам, а не по списку: помощник Беты заперт,
    // но окно открыто из-за остальных — двигать его просто не получится
    expect(movementDestinations(played, '0', 'beta_ally')).toEqual([]);
  });

  it('бойцов двигают до 2 клеток, затем возвращается действие', () => {
    const start = state();
    const before = actions(start);

    let run = play(start);
    // 2 → 5 идёт через клетку 1: это два шага, значит бюджет карты действительно 2
    run = step(run, 'beta', 5);
    run = finish(run);

    expect(cellOf(run, '1', 'beta')).toBe(5);
    // карта стоит действие и отдаёт его обратно
    expect(actions(run)).toBe(before);
    expect(run.movement ?? null).toBeNull();
    expect(run.effect ?? null).toBeNull();
    expect(player(run, '0').discard.cards.map(entry => entry.id)).toEqual(['tesla_10']);
  });

  it('«до 2 клеток» включает 0: никого не двигая, действие всё равно возвращается', () => {
    const start = state();
    const before = actions(start);

    const run = finish(play(start));

    expect(cellOf(run, '1', 'beta')).toBe(2);
    expect(actions(run)).toBe(before);
    expect(run.movement ?? null).toBeNull();
  });

  it('чужих бойцов на поле нет: карта даёт только действие', () => {
    const start = state({ withOthers: false });
    const before = actions(start);

    const run = play(start);

    expect(run.movement ?? null).toBeNull();
    expect(actions(run)).toBe(before);
    expect(run.effect ?? null).toBeNull();
  });
});
