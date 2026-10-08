import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import { movementDestinations, movementRejection } from '#shared/helpers/turn.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = medusaCards.find(entry => entry.id === 'medusa_11');

/**
 * Линия 1—2—3—4—5—6, одна синяя зона, и красная клетка 7 рядом с 6.
 * Медуза на 2, Гарпия на 5, враг на 3 (перекрывает путь), убитая Гарпия — в `lost`.
 */
const zoneMap = {
  id: 'zones',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3, 5], terrain: 'ice' },
    { id: 5, neighbors: [4, 6], terrain: 'ice' },
    { id: 6, neighbors: [5, 7], terrain: 'ice' },
    { id: 7, neighbors: [6], terrain: 'lava' },
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
    move: 3,
    attackRange: 1,
  }),
  ...extra,
});

const deadHarpy = () => ({
  ...unit('harpies_2', null, 1, { type: 'assistant', group: 'harpies' }),
  currentPosition: null,
  currentHp: 0,
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

/** Медуза держит «Возрождение стаи»; одна Гарпия мертва, одна на поле. */
const state = ({ lost = [deadHarpy()] } = {}) =>
  createState({
    phase: PHASES.turn,
    map: zoneMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [
          unit('medusa', 2, 16, { attackRange: 3 }),
          unit('harpies_1', 5, 1, { type: 'assistant', group: 'harpies' }),
        ],
        [{ ...card, instanceId: 'medusa_11_1' }],
        lost,
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 13, { attackRange: 3 })]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const playCard = (start = state()) =>
  runAction(start, { type: 'PICK', kind: 'card', id: 'medusa_11_1', playerId: '0' });

const step = (state, fighterId, cellId) =>
  runAction(state, {
    type: 'PICK',
    kind: 'cell',
    id: cellId,
    fighterId,
    playerId: '0',
  });

const finishEffect = state => runAction(state, { type: 'UI_OK', playerId: '0' });

const pickCell = (state, cellId) =>
  runAction(state, { type: 'PICK', kind: 'cell', id: cellId, playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта medusa_11 «Возрождение стаи»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['effect', 'effect', 'picked']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
  });

  it('сначала двигает всех своих бойцов с проходом сквозь врагов', () => {
    const played = playCard();

    expect(played.turn.actionsLeft).toBe(1);
    expect(played.movement.budget).toBe(3);
    expect(played.movement.throughEnemies).toBe(true);
    expect(played.movement.fighters.sort()).toEqual(['harpies_1', 'medusa']);
    expect(played.effect.steps.map(step_ => step_.status)).toEqual([
      'waiting',
      'pending',
      'pending',
    ]);

    // Медуза со 2-й клетки проходит сквозь врага на 3-й: 3 занята, а встать можно на 1 и 4
    expect(movementDestinations(played, '0', 'medusa').sort()).toEqual(['1', '4']);
    const moved = step(played, 'medusa', '4');
    expect(fighterOf(moved, '0', 'medusa').currentPosition).toBe('4');
  });

  it('без прохода сквозь врагов тот же ход был бы невозможен', () => {
    const played = playCard();
    played.movement.throughEnemies = false;

    // клетка 3 занята врагом: путь закрыт, дальше неё не пройти
    expect(movementDestinations(played, '0', 'medusa')).toEqual(['1']);
    expect(movementRejection(played, '0', 'medusa', '4')).toMatch(/вне радиуса/);
  });

  it('после перемещения предлагает свободные клетки в области Медузы и воскрешает Гарпию', () => {
    const played = playCard();
    const moved = finishEffect(step(played, 'medusa', '4'));

    // Медуза на 4: её область — синие клетки, свободные — 1, 2, 6 (7 красная, 3 и 5 заняты)
    expect(moved.targeting.kind).toBe('cells');
    expect(moved.targeting.required).toBe(true);
    expect(moved.targeting.candidates.map(entry => entry.cellId).sort()).toEqual(['1', '2', '6']);
    expect(runUi(moved, '0').highlightedCellIds.sort()).toEqual(['1', '2', '6']);
    expect(moved.effect.steps.map(step_ => step_.status)).toEqual([
      'applied',
      'waiting',
      'pending',
    ]);

    const revived = pickCell(moved, '6');

    const harpy = fighterOf(revived, '0', 'harpies_2');
    expect(harpy.currentPosition).toBe('6');
    expect(harpy.currentHp).toBe(1);
    expect(player(revived, '0').lost).toEqual([]);
    expect(revived.effect).toBeNull();
    expect(revived.targeting).toBeNull();
  });

  it('воскрешать некого: шаг помечается skipped, окна нет', () => {
    const played = playCard(state({ lost: [] }));
    const after = finishEffect(played);

    expect(after.targeting ?? null).toBeNull();
    expect(after.effect).toBeNull();
    expect(player(after, '0').fighters).toHaveLength(2);
  });

  it('в области Медузы нет свободной клетки — воскрешение не предлагается', () => {
    const crowded = state();
    // все синие клетки, кроме занятой Медузой, заняты врагами
    player(crowded, '1').fighters = [
      unit('beta', 1, 13),
      unit('beta_2', 3, 5),
      unit('beta_3', 4, 5),
      unit('beta_4', 6, 5),
    ];

    const played = playCard(crowded);
    const after = finishEffect(played);

    expect(after.targeting ?? null).toBeNull();
    expect(player(after, '0').lost).toHaveLength(1);
  });
});
