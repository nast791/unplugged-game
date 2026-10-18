import { describe, expect, it } from 'vitest';
import { runUi } from '#shared/publicApi.js';
import { createState, fighter, hand, PHASES, player } from '../../fixtures/state.js';
import anubisCards from '../../../server/content/heroes/anubis/cards.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import snowQueenCards from '../../../server/content/heroes/snow-queen/cards.js';

/**
 * Правило владельца: **карта эффекта дизейблится, только если при розыгрыше не произойдёт ничего**.
 * Если хоть какая-то часть свойства срабатывает — даже негативная, — карта играется.
 *
 * Проверяется через `runUi(...).playableCardIds`: предложение карты считает движок (`effectBrings`
 * прогоняет правила на форке и сравнивает состояние), а не клиент.
 */
const cardOf = (pack, id) => pack.find(entry => entry.id === id);
const card = id =>
  cardOf(anubisCards, id) ??
  cardOf(dorothyCards, id) ??
  cardOf(ifritCards, id) ??
  cardOf(snowQueenCards, id);

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

/** Стол 1—2—3—4: Анубис на 2, Бета на 3. Стихии задаются картой (`terrain`). */
const lineMap = terrain => ({
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain },
    { id: 2, neighbors: [1, 3], terrain },
    { id: 3, neighbors: [2, 4], terrain },
    { id: 4, neighbors: [3], terrain },
  ],
});

/**
 * Партия: мой слот с картой в руке и бойцами, слот противника, общий сброс/колода.
 * `mine.lost` — павшие бойцы, `mine.discard` — карты в сбросе, `foeFighters` — бойцы противника.
 */
const buildState = ({
  cardId,
  map = lineMap('lava'),
  mineFighters = [unit('anubis', 1, 15), unit('amat', 2, 8, { type: 'assistant', group: 'amat' })],
  foeFighters = [unit('beta', 3, 13)],
  lost = [],
  discard = [],
  deck = [],
  handExtra = [],
  items = [],
} = {}) =>
  createState({
    phase: PHASES.turn,
    map,
    players: [
      {
        id: '0',
        name: 'Я',
        order: 1,
        placementReady: true,
        deck: zone(deck),
        hand: zone([{ ...card(cardId), instanceId: `${cardId}_1` }, ...handExtra]),
        discard: zone(discard),
        fighters: mineFighters,
        lost,
        items,
      },
      {
        id: '1',
        name: 'Бета',
        order: 2,
        placementReady: true,
        deck: zone([]),
        hand: zone([]),
        discard: zone([]),
        fighters: foeFighters,
        items: [],
      },
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const playableFor = (state, cardId) => runUi(state, '0').playableCardIds.includes(`${cardId}_1`);
const isDisabled = (state, cardId) => runUi(state, '0').disabledCardIds.includes(`${cardId}_1`);

describe('карта эффекта предлагается, только если розыгрыш что-то изменит', () => {
  it('«Прыжок в лаву»: без свободной клетки лавы карта задизейблена, со свободной — играется', () => {
    const withoutLava = buildState({
      cardId: 'ifrit_10',
      map: lineMap('desert'),
      mineFighters: [unit('ifrit', 1, 14)],
    });
    expect(playableFor(withoutLava, 'ifrit_10')).toBe(false);
    expect(isDisabled(withoutLava, 'ifrit_10')).toBe(true);

    const withLava = buildState({
      cardId: 'ifrit_10',
      map: lineMap('lava'),
      mineFighters: [unit('ifrit', 1, 14)],
    });
    expect(playableFor(withLava, 'ifrit_10')).toBe(true);
  });

  it('«Прыжок в лаву»: все клетки лавы заняты — тоже задизейблена', () => {
    const state = buildState({
      cardId: 'ifrit_10',
      map: lineMap('lava'),
      mineFighters: [unit('ifrit', 1, 14)],
      foeFighters: [unit('beta', 3, 13), unit('beta_pawn', 2, 5), unit('beta_pawn_2', 4, 5)],
    });

    // свободных клеток лавы нет (1 занята Ифритом, 2 и 3, 4 — чужими)
    expect(playableFor(state, 'ifrit_10')).toBe(false);
  });

  it('«Зелёные очки»: играется и при пустой колоде — добор отнимает здоровье', () => {
    const state = buildState({
      cardId: 'dorothy_09',
      mineFighters: [unit('dorothy', 1, 13)],
      deck: [],
    });

    expect(playableFor(state, 'dorothy_09')).toBe(true);
    expect(isDisabled(state, 'dorothy_09')).toBe(false);
  });

  it('«Кристальный резонанс»: меньше пяти осколков — задизейблена', () => {
    const fewShards = buildState({
      cardId: 'snow-queen_12',
      mineFighters: [unit('snow-queen', 1, 16)],
      discard: [1, 2, 3, 4].map(index => ({ id: `shard_${index}`, title: 'Осколок', tags: ['shard'] })),
    });
    expect(playableFor(fewShards, 'snow-queen_12')).toBe(false);
    expect(isDisabled(fewShards, 'snow-queen_12')).toBe(true);

    const enoughShards = buildState({
      cardId: 'snow-queen_12',
      mineFighters: [unit('snow-queen', 1, 16)],
      // Бета стоит рядом с королевой: урон есть по кому наносить, и осколки есть что вернуть
      foeFighters: [unit('beta', 2, 13)],
      discard: [1, 2, 3, 4, 5].map(index => ({
        id: `shard_${index}`,
        title: 'Осколок',
        tags: ['shard'],
      })),
    });
    expect(playableFor(enoughShards, 'snow-queen_12')).toBe(true);
  });

  it('«Вечность»: без поверженной вороны задизейблена, с вороной — играется', () => {
    const noCrow = buildState({
      cardId: 'snow-queen_13',
      map: lineMap('ice'),
      mineFighters: [unit('snow-queen', 1, 16)],
    });
    expect(playableFor(noCrow, 'snow-queen_13')).toBe(false);
    expect(isDisabled(noCrow, 'snow-queen_13')).toBe(true);

    const withCrow = buildState({
      cardId: 'snow-queen_13',
      map: lineMap('ice'),
      mineFighters: [unit('snow-queen', 1, 16)],
      lost: [unit('crow_1', null, 0, { type: 'assistant', group: 'crow' })],
    });
    expect(playableFor(withCrow, 'snow-queen_13')).toBe(true);
  });

  it('«Суд молчит»: двигавшийся Анубис — карта задизейблена, тихий ход — играется', () => {
    const moved = buildState({
      cardId: 'anubis_09',
      mineFighters: [unit('anubis', 1, 15, { movedThisTurn: true }), unit('amat', 2, 8)],
    });
    expect(playableFor(moved, 'anubis_09')).toBe(false);
    expect(isDisabled(moved, 'anubis_09')).toBe(true);

    const quiet = buildState({
      cardId: 'anubis_09',
      deck: [{ id: 'deck_a', title: 'A', bonus: 1 }],
    });
    expect(playableFor(quiet, 'anubis_09')).toBe(true);
  });

  it('«Плач по Амат»: без убитой Амат задизейблена, с убитой — играется', () => {
    const alive = buildState({ cardId: 'anubis_10' });
    expect(playableFor(alive, 'anubis_10')).toBe(false);
    expect(isDisabled(alive, 'anubis_10')).toBe(true);

    const lost = buildState({
      cardId: 'anubis_10',
      mineFighters: [unit('anubis', 1, 15)],
      lost: [unit('amat', null, 0, { type: 'assistant', group: 'amat' })],
      deck: [{ id: 'deck_a', title: 'A', bonus: 1 }],
    });
    expect(playableFor(lost, 'anubis_10')).toBe(true);
  });
});
