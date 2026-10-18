import { describe, expect, it } from 'vitest';
import { runUi } from '#shared/publicApi.js';
import { SET_STATUS } from '#shared/actions/index.js';
import { createState, fighter, PHASES } from '../../fixtures/state.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';

/**
 * Связка с ботом: перечисление ходов (`bot/play/decide.js: enumerateActions`) берёт карты из
 * `ui.playableCardIds`, поэтому вето бота на пустой эффект (`acceptCard`: `known && fires === 0` → вес 0)
 * до такого варианта уже не доходит — карту не предлагает движок. Стережём именно это: у бота в
 * перечислении пустого эффекта нет, а сама карта остаётся доступной сбросом (в `disabledCardIds`).
 */
const card = ifritCards.find(entry => entry.id === 'ifrit_10');

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

/** Поле без лавы: «Прыжок в лаву» не найдёт свободной клетки стихии. */
const desertMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'desert' },
    { id: 2, neighbors: [1, 3], terrain: 'desert' },
    { id: 3, neighbors: [2, 4], terrain: 'desert' },
    { id: 4, neighbors: [3], terrain: 'desert' },
  ],
};

const buildState = () => {
  const state = createState({
    phase: PHASES.turn,
    map: desertMap,
    players: [
      {
        id: '0',
        name: 'Ифрит',
        order: 1,
        placementReady: true,
        deck: zone(Array.from({ length: 10 }, (_, index) => ({ id: `d${index}`, bonus: 1 }))),
        hand: zone([{ ...card, instanceId: 'ifrit_10_1' }]),
        discard: zone([]),
        fighters: [unit('ifrit', 1, 14, { attackRange: 2 })],
        items: [],
      },
      {
        id: '1',
        name: 'Бета',
        order: 2,
        placementReady: true,
        deck: zone([]),
        hand: zone([]),
        discard: zone([]),
        fighters: [unit('beta', 3, 13)],
        items: [],
      },
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

  SET_STATUS(state, { fighterIds: ['ifrit'], status: 'frozen', value: true });
  return state;
};

describe('вето на пустой эффект', () => {
  it('замороженный Ифрит без лавы: карты нет в перечислении, но она — топливо', () => {
    const state = buildState();
    const ui = runUi(state, '0');

    // свойства не будет: и боец заморожен, и клеток лавы нет — движок карту не предлагает
    expect(ui.playableCardIds).not.toContain('ifrit_10_1');
    expect(ui.disabledCardIds).toContain('ifrit_10_1');
    // карта с бонусом 3: сбросить её ради усиления по-прежнему можно
    expect(card.bonus).toBe(3);
  });
});
