import { describe, expect, it } from 'vitest';
import { SET_STATUS } from '#shared/actions/status.js';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, discard, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_10');

/**
 * Линия 1—2—3—4—5: лава на 1, 3 и 5; Ифрит на 2, Бета на 4.
 * Свободных клеток лавы две (1 и 5) — выбор есть, но линия разорвана боями не мешает.
 */
const lavaMap = {
  id: 'lava',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'lava' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'lava' },
    { id: 4, neighbors: [3, 5], terrain: 'ice' },
    { id: 5, neighbors: [4], terrain: 'lava' },
  ],
};

/** Та же линия, но лавы на карте нет вовсе. */
const noLavaMap = {
  id: 'ice',
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

/** Ифрит на 2 держит «Прыжок в лаву»; Бета на 4 занимает лаву 3 своим телом. */
const buildState = ({ map = lavaMap, betaCell = 4, extraHand = [] } = {}) =>
  createState({
    phase: PHASES.turn,
    map,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 2, 14, { attackRange: 3 })],
        [{ ...card, instanceId: 'ifrit_10_1' }, ...extraHand],
      ),
      slot('1', 'Бета', 2, [unit('beta', betaCell, 14)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const play = state =>
  runAction(state, { type: 'PICK', kind: 'card', id: 'ifrit_10_1', playerId: '0' });

const pickCell = (state, cellId) =>
  runAction(state, { type: 'PICK', kind: 'cell', id: cellId, playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_10 «Прыжок в лаву»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['effect', 'picked']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'effect',
      value: null,
      bonus: 3,
      quantity: 2,
      fighter: 'ifrit',
    });
    expect(card.rules[0].when[1]).toMatchObject({
      fact: 'CELLS',
      params: { terrain: 'lava', free: true },
      var: 'cells',
    });
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_TARGETING',
      kind: 'cells',
      required: true,
    });
    expect(card.rules[1].then[0]).toMatchObject({ action: 'SET_FIGHTER_CELL', fighterId: 'ifrit' });
  });

  it('открывается обязательное окно только со свободными клетками лавы', () => {
    const played = play(buildState());

    expect(played.turn.actionsLeft).toBe(1);
    expect(played.targeting).toMatchObject({ playerId: '0', kind: 'cells', required: true });
    // свободны все три клетки лавы: 1, 3 и 5 (Бета стоит на 4)
    expect(played.targeting.candidates.map(entry => entry.cellId).sort()).toEqual(['1', '3', '5']);
    expect(runUi(played, '0').highlightedCellIds.sort()).toEqual(['1', '3', '5']);
    // карта эффекта уже в сбросе
    expect(discard(player(played, '0')).map(entry => entry.id)).toEqual(['ifrit_10']);
  });

  it('после выбора Ифрит стоит на выбранной клетке лавы', () => {
    const jumped = pickCell(play(buildState()), '5');

    expect(String(fighterOf(jumped, '0', 'ifrit').currentPosition)).toBe('5');
    // выбранная клетка именно та, что отметил игрок, а не просто любая лава
    expect(fighterOf(jumped, '0', 'ifrit').movedThisTurn).toBe(true);
    expect(jumped.targeting ?? null).toBeNull();
    expect(jumped.effect ?? null).toBeNull();
  });

  it('на не-лаву так не попасть: клетки 2 и 4 не среди кандидатов', () => {
    const played = play(buildState());
    const cells = played.targeting.candidates.map(entry => entry.cellId);

    expect(cells).not.toContain('2');
    expect(cells).not.toContain('4');
    expect(() => pickCell(played, '4')).toThrow(/не среди кандидатов/);
  });

  it('клетка лавы, занятая бойцом, в окно не попадает', () => {
    // Бета встала на лаву 3 — кандидатов остаётся двое: 1 и 5
    const played = play(buildState({ betaCell: 3 }));

    expect(played.targeting.candidates.map(entry => entry.cellId).sort()).toEqual(['1', '5']);
  });

  it('лавы на карте нет — окно не открывается, эффект заканчивается впустую', () => {
    const played = play(buildState({ map: noLavaMap }));

    expect(played.targeting ?? null).toBeNull();
    expect(played.effect ?? null).toBeNull();
    expect(String(fighterOf(played, '0', 'ifrit').currentPosition)).toBe('2');
    // действие всё равно потрачено, карта в сбросе
    expect(played.turn.actionsLeft).toBe(1);
    expect(discard(player(played, '0')).map(entry => entry.id)).toEqual(['ifrit_10']);
  });

  it('замороженному прыжок закрыт: окна нет, а не падение на клике', () => {
    const state = buildState();
    SET_STATUS(state, { fighterIds: ['ifrit'], status: 'frozen', value: true });

    const played = play(state);

    expect(played.targeting ?? null).toBeNull();
    expect(String(fighterOf(played, '0', 'ifrit').currentPosition)).toBe('2');
  });

  it('все клетки лавы заняты — окна нет', () => {
    const state = buildState();
    // Бета и её помощники закрывают 1, 3 и 5
    player(state, '1').fighters = [
      unit('beta', 3, 14),
      unit('beta_pawn_1', 1, 4, { type: 'assistant', group: 'beta_pawn' }),
      unit('beta_pawn_2', 5, 4, { type: 'assistant', group: 'beta_pawn' }),
    ];

    const played = play(state);

    expect(played.targeting ?? null).toBeNull();
    expect(String(fighterOf(played, '0', 'ifrit').currentPosition)).toBe('2');
  });

  it('прыжок не тратит лишних действий и не снимает Ифрита с поля', () => {
    const jumped = pickCell(play(buildState()), '1');

    expect(String(fighterOf(jumped, '0', 'ifrit').currentPosition)).toBe('1');
    expect(jumped.turn.actionsLeft).toBe(1);
    // Ифрит остался единственным бойцом в отряде — карту не «потеряли»
    expect(player(jumped, '0').fighters.map(entry => entry.id)).toEqual(['ifrit']);
  });
});
