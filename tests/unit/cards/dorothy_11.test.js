import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import { fighterClickIntent } from '#shared/helpers/ui.js';
import movementPhase from '#shared/phases/movement.js';
import {
  movableFighterIds,
  movementDestinations,
  movementRejection,
} from '#shared/helpers/turn.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_11');

/** Линия 1—2—3—4—5—6: Дороти на 1, Тото на 3, Бета на 6 (враг нужен только для партии). */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3, 5], terrain: 'ice' },
    { id: 5, neighbors: [4, 6], terrain: 'ice' },
    { id: 6, neighbors: [5], terrain: 'ice' },
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

const slot = (id, name, order, fighters, hand = [], lost = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone(hand),
  discard: zone([]),
  fighters,
  lost,
});

/** Дороти держит «Золотую шапку»; `foeCell` — где стоит Бета (по умолчанию на дальнем конце). */
const buildState = ({ foeCell = 6 } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [unit('dorothy', 1, 12), unit('toto', 3, 6, { type: 'assistant', group: 'toto' })],
        [{ ...card, instanceId: 'dorothy_11_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', foeCell, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
  });

const play = state =>
  runAction(state, { type: 'PICK', kind: 'card', id: 'dorothy_11_1', playerId: '0' });

const step = (state, fighterId, cellId) =>
  runAction(state, {
    type: 'PICK',
    kind: 'cell',
    id: cellId,
    fighterId,
    playerId: '0',
  });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта dorothy_11 «Золотая шапка»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('effect');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    // тройка усиления есть у «Золотой шапки» и «Зелёных очков» (`.docs/hero-algorithm.md` §6)
    expect(card).toMatchObject({ type: 'effect', value: null, bonus: 3, fighter: 'dorothy' });
    // обезьяны перебираются по крышам: враг на пути не останавливает
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_MOVEMENT',
      budget: 4,
      throughEnemies: true,
    });
  });

  it('открывает перенос пары: бюджет 4 шагов каждому, действие тратится один раз', () => {
    const played = play(buildState());

    expect(played.turn.actionsLeft).toBe(1);
    expect(played.movement).toMatchObject({
      playerId: '0',
      budget: 4,
      optional: true,
      throughEnemies: true,
      stepwise: true,
      fighters: ['dorothy', 'toto'],
    });
    expect(movableFighterIds(played, '0')).toEqual(['dorothy', 'toto']);
    // шаг — одна клетка: Дороти с 1 видит только соседнюю 2 (своего Тото на 3 не обойти за раз)
    expect(movementDestinations(played, '0', 'dorothy')).toEqual(['2']);
    // Тото с 3 идёт в обе стороны: 2 свободна, 4 свободна
    expect(movementDestinations(played, '0', 'toto')).toEqual(['2', '4']);
  });

  it('оба бойца переставляются по клеткам, эффект закрывается концом перемещения', () => {
    let run = play(buildState());
    // шапка двигает по одной клетке: Дороти 1→2, Тото 3→4→5
    run = step(run, 'dorothy', 2);
    run = step(run, 'toto', 4);
    run = step(run, 'toto', 5);

    expect(fighterOf(run, '0', 'dorothy').currentPosition).toBe(2);
    expect(fighterOf(run, '0', 'toto').currentPosition).toBe(5);

    const finished = runAction(run, { type: 'UI_OK', playerId: '0' });

    expect(finished.movement).toBeNull();
    expect(finished.effect).toBeNull();
    expect(fighterOf(finished, '0', 'dorothy').currentPosition).toBe(2);
    expect(fighterOf(finished, '0', 'toto').currentPosition).toBe(5);
    expect(player(finished, '0').discard.cards.map(entry => entry.id)).toEqual(['dorothy_11']);
  });

  it('клетки пары рамкой не метятся: бойца выбирают кликом по фишке, клетки — после выбора', () => {
    const played = play(buildState());

    // у окна эффекта своих бойцов в подсветке нет: фигуры Дороти и Тото остаются без рамки
    expect(runUi(played, '0').highlightedFighterIds).toEqual([]);
    // клик по фишке — это выбор, а не ответ движку; клетки появляются у выбранного бойца
    expect(fighterClickIntent(runUi(played, '0'), 'dorothy', ['dorothy', 'toto'])).toBe('select');
    // Тото на 3: соседние 2 и 4
    expect(runUi(played, '0', { selectedFighterId: 'toto' }).highlightedCellIds).toEqual([
      '2',
      '4',
    ]);
  });

  it('враг на пути: шаг сквозь него разрешён, сквозь своего — тоже, но без урона', () => {
    const played = play(buildState({ foeCell: 2 }));

    // Дороти с 1: соседняя 2 — клетка врага, шаг сквозь неё разрешён
    expect(movementDestinations(played, '0', 'dorothy')).toEqual(['2']);
    const onto = step(played, 'dorothy', 2);
    expect(fighterOf(onto, '0', 'dorothy').currentPosition).toBe(2);
    // с 2 можно и назад, и вперёд — сквозь своего Тото шапка тоже носит
    expect(movementDestinations(onto, '0', 'dorothy')).toEqual(['1', '3']);
    // но остановиться на клетке своего бойца нельзя
    const ahead = step(onto, 'dorothy', 3);
    expect(fighterOf(ahead, '0', 'dorothy').currentPosition).toBe(3);
    expect(movementPhase.ok.enabled(ahead, '0')).toBe(false);
  });

  it('шаг ровно на одну клетку: за спину своего бойца за один клик не уйти', () => {
    const played = play(buildState({ foeCell: 6 }));

    // Тото на 3: у него соседние 2 и 4, и шапка двигает его по одной клетке
    expect(movementDestinations(played, '0', 'toto')).toEqual(['2', '4']);
    // Дороти с 1 видит только 2, а до 3 (клетка Тото) за один шаг не достать
    expect(movementDestinations(played, '0', 'dorothy')).toEqual(['2']);
    expect(movementRejection(played, '0', 'dorothy', 3)).toMatch(/не соседняя/);
  });

  it('Тото убит — шапка несёт одну Дороти', () => {
    const state = buildState();
    player(state, '0').fighters = player(state, '0').fighters.filter(entry => entry.id !== 'toto');
    player(state, '0').lost = [
      { ...unit('toto', null, 0, { type: 'assistant', group: 'toto' }), currentPosition: null },
    ];

    const played = play(state);

    expect(played.movement).toMatchObject({ fighters: ['dorothy'], budget: 4 });
    expect(movableFighterIds(played, '0')).toEqual(['dorothy']);
    // пошагово: с 1 видна только соседняя клетка 2
    expect(movementDestinations(played, '0', 'dorothy')).toEqual(['2']);
  });
});
