import { describe, expect, it } from 'vitest';
import { runAction } from '#shared/publicApi.js';
import { actionsFor } from '../../../bot/play/decide.js';
import anubisCards from '../../../server/content/heroes/anubis/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = anubisCards.find(entry => entry.id === 'anubis_12');

/** Линия 1—8: песок на 1 и 8, лёд между ними. Анубис на 2, Бета на 6 — вне его дальности 2. */
const lineMap = {
  id: 'sand-line',
  nodes: [1, 2, 3, 4, 5, 6, 7, 8].map(id => ({
    id,
    neighbors: [id - 1, id + 1].filter(entry => entry >= 1 && entry <= 8),
    terrain: id === 1 || id === 8 ? 'desert' : 'ice',
  })),
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

const buildState = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Анубис',
        1,
        [unit('anubis', 2, 15, { attackRange: 2 })],
        [{ ...card, instanceId: 'anubis_12_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 6, 15)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const play = state =>
  runAction(state, { type: 'PICK', kind: 'card', id: 'anubis_12_1', playerId: '0' });

/** Вес варианта «перенести Анубиса на эту клетку» среди вариантов бота. */
const cellWeight = (options, cellId) =>
  options.find(
    option =>
      option.action.type === 'PICK' &&
      option.action.kind === 'cell' &&
      String(option.action.id) === String(cellId),
  )?.weight;

describe('бот: окно клеток, которое переносит своего бойца', () => {
  it('клетку выбирает как позицию, а не жребием: песок на дистанции удара дороже дальнего', () => {
    const played = play(buildState());

    // свободного песка два: 1 (далеко от Беты) и 8 (в дальности удара)
    expect(played.targeting.candidates.map(entry => entry.cellId).sort()).toEqual(['1', '8']);

    const options = actionsFor(played, '0', { policy: 'greedy' });

    // «выйти на дистанцию удара» — вес шага, а не равный `pick`
    expect(cellWeight(options, '8')).toBeGreaterThan(cellWeight(options, '1'));
    expect(cellWeight(options, '8')).toBeGreaterThanOrEqual(7);
    expect(cellWeight(options, '1')).toBeGreaterThan(0);
  });

  it('чужой перенос клетку жребием не ломает: вес — прежний `pick`', () => {
    // окно без своего бойца (у карты переноса своего нет): веса клеток равны
    const played = play(buildState());
    const others = actionsFor(
      { ...played, targeting: { ...played.targeting, source: 'common_feint' } },
      '0',
      { policy: 'greedy' },
    );

    expect(cellWeight(others, '8')).toBe(cellWeight(others, '1'));
    expect(player(played, '0').hand.cards).toHaveLength(0);
  });
});
