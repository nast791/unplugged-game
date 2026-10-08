import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import { movementDestinations, movementRejection } from '#shared/helpers/turn.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, discard, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_11');

/** Линия 1—2—3—4—5: Ифрит на 1, Бета встаёт на 2 и перекрывает путь. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3, 5], terrain: 'ice' },
    { id: 5, neighbors: [4], terrain: 'ice' },
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

/** Духи встают в хвост линии (клетки 4 и 5): путь Ифрита они не занимают. */
const spirit = index =>
  unit(`ash_${index}`, 3 + index, 1, {
    name: `Пепельный дух ${index}`,
    type: 'assistant',
    group: 'ash',
  });

const deadSpirit = index => ({ ...spirit(index), currentPosition: null, currentHp: 0 });

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

/**
 * Ифрит на 1 держит «Пепельный ветер», живых духов — по списку `spirits` (их места в хвосте),
 * убитые лежат в `lost`. Бета на `betaCell` перекрывает линию.
 */
const buildState = ({ spirits = [1, 2, 3], betaCell = 2 } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 1, 14, { attackRange: 3 }), ...spirits.map(index => spirit(index))],
        [{ ...card, instanceId: 'ifrit_11_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', betaCell, 14)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const play = state =>
  runAction(state, { type: 'PICK', kind: 'card', id: 'ifrit_11_1', playerId: '0' });

const step = (state, cellId) =>
  runAction(state, { type: 'PICK', kind: 'cell', id: cellId, fighterId: 'ifrit', playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_11 «Пепельный ветер»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['effect', 'effect', 'effect']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'effect',
      value: null,
      bonus: 4,
      quantity: 2,
      fighter: 'ifrit',
    });
    // три тира по числу живых духов: бюджет 3 / 2 / 1
    expect(card.rules.map(rule => rule.when[0].params)).toEqual([
      { side: 'self', group: 'ash', min: 3, max: 3 },
      { side: 'self', group: 'ash', min: 2, max: 2 },
      { side: 'self', group: 'ash', min: 1, max: 1 },
    ]);
    expect(card.rules.map(rule => rule.then[0].budget)).toEqual([3, 2, 1]);
    for (const rule of card.rules) {
      expect(rule.then[0]).toMatchObject({
        action: 'SET_MOVEMENT',
        op: 'open',
        fighters: ['ifrit'],
        throughEnemies: true,
        optional: true,
      });
    }
  });

  it('три духа — бюджет перемещения 3', () => {
    const played = play(buildState({ spirits: [1, 2, 3] }));

    expect(played.turn.actionsLeft).toBe(1);
    expect(played.movement).toMatchObject({
      playerId: '0',
      budget: 3,
      throughEnemies: true,
      optional: true,
      fighters: ['ifrit'],
    });
    // Ифрит на 1, враг на 2, духи на 4 и 5: пройти можно на 2 и 3, встать — на 3
    expect(movementDestinations(played, '0', 'ifrit')).toEqual(['3']);
  });

  it('проход сквозь врага — именно свойство карты: без него дальше двойки не уйти', () => {
    const played = play(buildState({ spirits: [1, 2, 3] }));

    // на копии состояния выключаем флаг: путь перекрыт врагом на 2
    const noPass = structuredClone(played);
    noPass.movement.throughEnemies = false;

    expect(movementDestinations(played, '0', 'ifrit')).toEqual(['3']);
    expect(movementDestinations(noPass, '0', 'ifrit')).toEqual([]);
    expect(movementRejection(noPass, '0', 'ifrit', '3')).toMatch(/нет доступных клеток/);
  });

  it('два духа — бюджет 2', () => {
    const played = play(buildState({ spirits: [1, 2] }));

    expect(played.movement.budget).toBe(2);
    expect(movementDestinations(played, '0', 'ifrit')).toEqual(['3']);
  });

  it('один дух — бюджет 1: встать некуда, окно не открывается и эффект идёт впустую', () => {
    const played = play(buildState({ spirits: [1] }));

    // клетка 2 занята врагом: на бюджет 1 доступна только она, а встать на занятую нельзя,
    // поэтому пустое окно не открывается (иначе обязательный эффект встал бы намертво)
    expect(played.movement ?? null).toBeNull();
    expect(played.effect ?? null).toBeNull();
    expect(String(fighterOf(played, '0', 'ifrit').currentPosition)).toBe('1');
    expect(movementRejection(played, '0', 'ifrit', '2')).toMatch(/перемещение не открыто/);
  });

  it('шаг по подсветке сдвигает Ифрита на три клетки от исходной', () => {
    const played = play(buildState({ spirits: [1, 2, 3] }));
    const moved = step(played, '3');

    expect(String(fighterOf(moved, '0', 'ifrit').currentPosition)).toBe('3');
    expect(fighterOf(moved, '0', 'ifrit').movedThisTurn).toBe(true);
    // бюджет считается от исходной клетки: от 3 можно вернуться на 1, но не дальше
    expect(movementDestinations(moved, '0', 'ifrit')).toEqual(['1']);
  });

  it('духов нет — перемещение не открывается, эффект заканчивается впустую', () => {
    const state = buildState({ spirits: [] });
    player(state, '0').lost = [1, 2, 3].map(deadSpirit);

    const played = play(state);

    expect(played.movement ?? null).toBeNull();
    expect(played.effect ?? null).toBeNull();
    expect(String(fighterOf(played, '0', 'ifrit').currentPosition)).toBe('1');
    // действие потрачено, карта в сбросе
    expect(played.turn.actionsLeft).toBe(1);
    expect(discard(player(played, '0')).map(entry => entry.id)).toEqual(['ifrit_11']);
  });

  it('от перемещения можно отказаться: Ифрит остаётся на месте', () => {
    const played = play(buildState({ spirits: [1, 2, 3] }));
    const declined = runAction(played, { type: 'UI_OK', playerId: '0' });

    expect(declined.movement ?? null).toBeNull();
    expect(String(fighterOf(declined, '0', 'ifrit').currentPosition)).toBe('1');
    expect(declined.effect ?? null).toBeNull();
  });
});
