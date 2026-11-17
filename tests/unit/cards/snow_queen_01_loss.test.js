import { describe, expect, it } from 'vitest';
import { runAction, runUi } from '#shared/publicApi.js';
import { createState, fighter, hand, PHASES, player } from '../../fixtures/state.js';
import snowQueenCards from '../../../server/content/heroes/snow-queen/cards.js';

const mirror = snowQueenCards.find(entry => entry.id === 'snow-queen_01');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2], terrain: 'ice' },
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

const slot = (id, name, order, fighters, cards = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone(cards),
  discard: zone([]),
  fighters,
  lost: [],
});

const plain = (id, title, type = 'effect', value = 0, bonus = 1) => ({
  id,
  instanceId: id,
  title,
  type,
  value,
  bonus,
});

/**
 * Снежная королева бьёт «Зеркальным сколом» (3), а защита противника больше — она проиграла битву.
 * Свойство велит сбросить карту из руки на выбор **оппонента**, а не из руки королевы.
 */
const buildState = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Снежная королева',
        1,
        [unit('snow-queen', 1, 16)],
        [{ ...mirror, instanceId: 'mirror_1' }, plain('queen_hand', 'Оцепенение')],
      ),
      slot(
        '1',
        'Ифрит',
        2,
        [unit('ifrit', 2, 14)],
        [
          plain('hold_1', 'Столб огня', 'defense', 5),
          plain('rival_1', 'Жар из-под земли'),
          plain('rival_2', 'Вечный огонь'),
        ],
      ),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Атака королевы, защита противника: бой проигран, свойство открывает выбор карты. */
const battle = () => {
  let state = buildState();
  state = runAction(state, { type: 'PICK', kind: 'card', id: 'mirror_1', playerId: '0' });
  state = runAction(state, { type: 'PICK', kind: 'fighter', id: 'ifrit', playerId: '0' });
  return runAction(state, { type: 'PICK', kind: 'card', id: 'hold_1', playerId: '1' });
};

const zoneIds = (state, playerId, zone) =>
  (state.players.find(entry => String(entry.id) === String(playerId))?.[zone]?.cards ?? []).map(
    entry => String(entry.id),
  );

const playerHand = (state, playerId) => zoneIds(state, playerId, 'hand');
const playerDiscard = (state, playerId) => zoneIds(state, playerId, 'discard');

describe('«Зеркальный скол»: проигранная битва — сбрасывает оппонент из своей руки', () => {
  it('окно выбора открыто оппоненту и предлагает его карты', () => {
    const state = battle();

    expect(state.lastCombat ?? state.combat).toBeTruthy();
    const choice = state.combat?.choice;
    expect(choice?.playerId).toBe('1');
    expect(choice?.candidates.map(entry => String(entry.cardId))).toEqual(['rival_1', 'rival_2']);
  });

  it('кандидаты остаются настоящими картами руки: клиент открывает окно руки оппонента', () => {
    const state = battle();
    const ui = runUi(state, '1');

    expect(ui.choices).toHaveLength(2);
    for (const entry of ui.choices) {
      // без зоны и владельца клиент не знает, чью руку показывать (и показывает свою)
      expect(entry.zone).toBe('hand');
      expect(String(entry.ownerId)).toBe('1');
      expect(entry.title).toBeTruthy();
    }
  });

  it('оппонент сбрасывает карту из своей руки: королева не теряет карт', () => {
    const chosen = runAction(battle(), {
      type: 'PICK',
      kind: 'card',
      id: 'rival_1',
      playerId: '1',
    });

    expect(playerHand(chosen, '0')).toEqual(['queen_hand']);
    expect(playerHand(chosen, '1')).toEqual(['rival_2']);
    expect(playerDiscard(chosen, '1').sort()).toEqual(['hold_1', 'rival_1']);
  });

  it('бой закрывается без висящей паузы: шаг свойства сработал, а не ждёт', () => {
    const chosen = runAction(battle(), {
      type: 'PICK',
      kind: 'card',
      id: 'rival_1',
      playerId: '1',
    });

    expect(chosen.combat ?? null).toBeNull();
    expect(chosen.targeting ?? null).toBeNull();
    const steps = chosen.lastCombat?.effects ?? [];
    // «Если вы проиграли» — сработало; «Если выиграли» — ветка той же карты не сработала
    expect(steps.map(entry => entry.status)).toEqual(['applied', 'skipped']);
    // шаг помнит, что именно сброшено: окно итога печатает карту, а не пустую строку
    expect(steps[0].cards ?? steps[0].discarded ?? []).toContain('rival_1');
    // и её вид: название, тип, значение и бонус — без них в результате были пустые кавычки
    expect(steps[0].pickedCards?.[0]?.title).toBe('Жар из-под земли');
    expect(steps[0].pickedCards?.[0]?.type).toBe('effect');
    expect(steps[0].pickedCards?.[0]?.value).toBe(0);
    expect(steps[0].pickedCards?.[0]?.bonus).toBe(1);
  });
});
