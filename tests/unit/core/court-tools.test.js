import { describe, expect, it } from 'vitest';
import { runFact } from '#shared/publicApi.js';
import turnStart from '#shared/lifecycle/turnStart.js';
import { SET_CARDS } from '#shared/actions/cards.js';
import { RECALL_PLAYED_CARD } from '#shared/actions/recall.js';
import { SET_ITEM } from '#shared/actions/items.js';
import { SET_HEALTH } from '#shared/actions/health.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const zone = (cards = []) => ({ visibility: [], cards });

const unit = (id, cell, extra = {}) => ({
  ...fighter({
    id,
    name: id,
    type: extra.type ?? 'hero',
    currentPosition: cell,
    currentHp: extra.hp ?? 10,
    move: 2,
    attackRange: 1,
  }),
  startHp: extra.hp ?? 10,
  ...extra,
});

const slot = (id, name, order, fighters, extra = {}) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone(extra.deck),
  hand: zone(extra.hand),
  discard: zone(extra.discard),
  fighters,
  ...(extra.items ? { items: extra.items } : {}),
});

const shroud = state => ({ id: 'shroud', group: 'shroud', name: 'Пелена', type: 'item', count: 1, state });

const build = (extra = {}) =>
  createState({
    phase: PHASES.turn,
    map: {
      id: 'line',
      nodes: [
        { id: 1, neighbors: [2], terrain: 'desert' },
        { id: 2, neighbors: [1, 3], terrain: 'ice' },
      ],
    },
    players: [
      slot('0', 'Анубис', 1, [unit('anubis', 1)], {
        items: [shroud(extra.shroudState ?? 'inactive')],
        hand: extra.hand,
        discard: extra.discard,
        deck: extra.deck,
      }),
      slot('1', 'Бета', 2, [unit('beta', 2)], { hand: extra.rivalHand }),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

describe('инструменты суда: факты и действия', () => {
  it('CARDS с count отдаёт число карт, а не список', () => {
    const state = build({
      discard: [
        { id: 'anubis_09', instanceId: 'anubis_09_1', type: 'effect' },
        { id: 'anubis_10', instanceId: 'anubis_10_1', type: 'effect' },
        { id: 'anubis_01', instanceId: 'anubis_01_1', type: 'attack' },
      ],
    });

    const counted = runFact(state, 'CARDS', { zone: 'discard', type: 'effect', count: true });

    expect(counted.value).toBe(2);
  });

  it('CARDS limit берёт верхние карты колоды, exclude выбрасывает выбранную', () => {
    const state = build({
      deck: [
        { id: 'deck_low', instanceId: 'deck_low_1' },
        { id: 'deck_mid', instanceId: 'deck_mid_1' },
        { id: 'deck_top', instanceId: 'deck_top_1' },
      ],
    });

    // верх колоды — конец массива: `limit: 2` даёт две верхние карты
    const top = runFact(state, 'CARDS', { zone: 'deck', limit: 2 });
    expect(top.value.map(entry => entry.cardId)).toEqual(['deck_mid_1', 'deck_top_1']);

    // выбранную из окна карту условие второй ветки уже не видит
    const rest = runFact(state, 'CARDS', { zone: 'deck', exclude: ['deck_top_1'], limit: 1 });
    expect(rest.value.map(entry => entry.cardId)).toEqual(['deck_mid_1']);
  });

  it('SET_CARDS bottom кладёт карту под низ колоды', () => {
    const state = build({
      deck: [
        { id: 'deck_low', instanceId: 'deck_low_1' },
        { id: 'deck_mid', instanceId: 'deck_mid_1' },
        { id: 'deck_top', instanceId: 'deck_top_1' },
      ],
    });

    SET_CARDS(state, { playerId: '0', op: 'bottom', from: 'deck', cardIds: ['deck_top_1'] });

    expect(player(state, '0').deck.cards.map(card => card.instanceId)).toEqual([
      'deck_top_1',
      'deck_low_1',
      'deck_mid_1',
    ]);
  });

  it('FIGHTERS понимает роль в `of`: герой оппонента находится вне боя', () => {
    const state = build();

    const found = runFact(state, 'FIGHTERS', { of: 'opponent', type: 'hero' });

    expect(found.value.map(entry => entry.fighterId)).toEqual(['beta']);
  });

  it('SET_HEALTH принимает урон без отрицательного знака (`damage`)', () => {
    const state = build();

    SET_HEALTH(state, { playerId: '0', fighterIds: ['beta'], damage: 3 });

    expect(player(state, '1').fighters[0].currentHp).toBe(7);
  });

  it('карту с noReturn нельзя вернуть в руку', () => {
    const state = build({
      discard: [{ id: 'anubis_11', instanceId: 'anubis_11_1', type: 'effect', noReturn: true }],
    });

    expect(() =>
      SET_CARDS(state, {
        playerId: '0',
        op: 'move',
        from: 'discard',
        to: 'hand',
        cardIds: ['anubis_11_1'],
      }),
    ).toThrow(/нельзя вернуть в руку/);
  });

  it('карту с noReturn не возвращает RECALL_PLAYED_CARD', () => {
    const state = build({
      discard: [{ id: 'anubis_11', instanceId: 'anubis_11_1', type: 'effect', noReturn: true }],
    });

    RECALL_PLAYED_CARD(state, {
      playerId: '0',
      playedCard: { id: 'anubis_11', instanceId: 'anubis_11_1' },
      valueDelta: -1,
    });

    expect(player(state, '0').hand.cards).toHaveLength(0);
  });
});

describe('временное состояние предмета', () => {
  it('SET_ITEM с until помечает предмет и возвращает прежнее состояние на turnStart', () => {
    const state = build({ shroudState: 'inactive' });

    SET_ITEM(state, { playerId: '0', group: 'shroud', to: 'active', until: 'turnStart' });

    expect(player(state, '0').items[0]).toMatchObject({
      state: 'active',
      temporary: { until: 'turnStart', restore: 'inactive' },
    });

    // пелена возвращается в начале хода владельца: предыдущий ход был у оппонента
    const next = turnStart.enter({ ...state, turn: { ...state.turn, playerId: '1' } });

    expect(player(next, '0').items[0]).toEqual({
      id: 'shroud',
      group: 'shroud',
      name: 'Пелена',
      type: 'item',
      count: 1,
      state: 'inactive',
    });
  });
});
