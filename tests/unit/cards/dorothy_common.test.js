import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runFact } from '#shared/facts/run.js';
import { runAction, runUi } from '#shared/publicApi.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const volley = dorothyCards.find(entry => entry.id === 'common_volley');
const recall = dorothyCards.find(entry => entry.id === 'common_recall');

/** Линия 1—2—3—4—5: 1—3 лёд (область Дороти), 4—5 лава. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3, 5], terrain: 'lava' },
    { id: 5, neighbors: [4], terrain: 'lava' },
  ],
};

/** Стык зон: 1—2 лёд (область Дороти), 3—5 лава — соседняя клетка уже чужая область. */
const crossMap = {
  id: 'cross',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'lava' },
    { id: 4, neighbors: [3, 5], terrain: 'lava' },
    { id: 5, neighbors: [4], terrain: 'lava' },
  ],
};

/** Для «Подмоги» хватает короткой линии: 1—2—3 лёд, 4 лава. */
const shortMap = {
  id: 'short',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3], terrain: 'lava' },
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

const deadToto = () => ({
  ...unit('toto', null, 6, { type: 'assistant', group: 'toto' }),
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

/** Дороти на 2, её карта боя в руке; враги игрока 1 — залп бьёт по всей её области. */
const volleyState = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [unit('dorothy', 2, 12)],
        [{ ...volley, instanceId: 'common_volley_1' }],
      ),
      slot('1', 'Бета', 2, [
        unit('beta', 3, 13),
        unit('beta_pawn', 1, 5, { type: 'assistant', group: 'beta_pawn' }),
        unit('gamma', 5, 9),
      ]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Дороти на 2, Тото убит и лежит в `lost`, враг — на лаве. */
const recallState = () =>
  createState({
    phase: PHASES.turn,
    map: shortMap,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [unit('dorothy', 2, 12)],
        [{ ...recall, instanceId: 'common_recall_1' }],
        [deadToto()],
      ),
      slot('1', 'Бета', 2, [unit('beta', 4, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('общие карты колоды Дороти', () => {
  it('«Залп» и «Подмога» описаны правилами, моменты — из списка', () => {
    for (const card of [volley, recall]) {
      expect(card.hook).toBeUndefined();
      for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    }
    expect(volley).toMatchObject({ type: 'attack', value: 2, bonus: 2 });
    expect(volley.rules.map(rule => rule.moment)).toEqual(['afterCombat']);
    expect(recall).toMatchObject({ type: 'effect', bonus: 2 });
    expect(recall.rules.map(rule => rule.moment)).toEqual(['effect', 'picked']);
  });

  it('«Залп»: 1 урон всем бойцам противника в области своего бойца', () => {
    const opened = runAction(volleyState(), {
      type: 'PICK',
      kind: 'card',
      id: 'common_volley_1',
      playerId: '0',
    });
    // Бета и помощник рядом с Дороти, третий враг — на лаве: цель выбирает игрок
    expect(opened.combat.stage).toBe('target');

    let run = runAction(opened, { type: 'PICK', kind: 'fighter', id: 'beta', playerId: '0' });
    run = runAction(run, { type: 'UI_OK', playerId: '1' });

    expect(run.lastCombat.combatDamage).toBe(2);
    // бой: 13 − 2, потом залп по области — ещё 1
    expect(fighterOf(run, '1', 'beta').currentHp).toBe(10);
    expect(fighterOf(run, '1', 'beta_pawn').currentHp).toBe(4);
    // враг на лаве в область Дороти не попадает
    expect(fighterOf(run, '1', 'gamma').currentHp).toBe(9);
  });

  it('«Залп»: врагов в области нет — свойство пропускается без ошибки', () => {
    const state = volleyState();
    // цель стоит на соседней клетке, но уже в другой стихии: залпу в области некого бить
    state.map = crossMap;
    player(state, '1').fighters = [unit('beta', 3, 13), unit('beta_pawn', 5, 5)];

    let run = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'common_volley_1',
      playerId: '0',
    });
    run = runAction(run, { type: 'PICK', kind: 'fighter', id: 'beta', playerId: '0' });
    run = runAction(run, { type: 'UI_OK', playerId: '1' });

    expect(fighterOf(run, '1', 'beta').currentHp).toBe(11);
    expect(fighterOf(run, '1', 'beta_pawn').currentHp).toBe(5);
  });

  it('«Подмога»: область героя читается и по списку бойцов из FIGHTERS', () => {
    const state = recallState();
    // правило берёт героя фактом FIGHTERS (список объектов), а клетки ищет по его области
    const heroes = runFact(
      state,
      'FIGHTERS',
      { side: 'self', type: 'hero', min: 1 },
      { playerId: '0' },
    ).value;
    expect(heroes.map(entry => entry.fighterId)).toEqual(['dorothy']);

    // 1 и 3 свободны, 2 занята Дороти, 4 — лава и чужая область
    expect(runFact(state, 'CELLS', { areaOf: heroes, free: true }, { playerId: '0' })).toEqual({
      ok: true,
      value: ['1', '3'],
    });
    expect(
      runFact(state, 'CELLS', { areaOf: 'dorothy', free: true }, { playerId: '0' }),
    ).toMatchObject({ ok: true, value: ['1', '3'] });
  });

  it('«Подмога» поднимает убитого Тото на свободную клетку в области Дороти', () => {
    const played = runAction(recallState(), {
      type: 'PICK',
      kind: 'card',
      id: 'common_recall_1',
      playerId: '0',
    });

    expect(played.turn.actionsLeft).toBe(1);
    expect(played.targeting).toMatchObject({
      playerId: '0',
      kind: 'cells',
      count: 1,
      required: true,
    });
    expect(played.targeting.candidates.map(entry => entry.cellId)).toEqual(['1', '3']);
    expect(runUi(played, '0').highlightedCellIds.sort()).toEqual(['1', '3']);

    const revived = runAction(played, {
      type: 'PICK',
      kind: 'cell',
      id: '3',
      playerId: '0',
    });

    expect(fighterOf(revived, '0', 'toto').currentPosition).toBe('3');
    expect(fighterOf(revived, '0', 'toto').currentHp).toBe(6);
    expect(player(revived, '0').lost).toEqual([]);
    expect(revived.targeting).toBeNull();
    expect(revived.effect).toBeNull();
    expect(player(revived, '0').discard.cards.map(entry => entry.id)).toEqual(['common_recall']);
  });

  it('«Подмога»: в области героя нет свободной клетки — окна нет', () => {
    const state = recallState();
    // все клетки области заняты: 1 и 3 — помощниками врага, 2 — самой Дороти
    player(state, '1').fighters = [
      unit('beta', 4, 13),
      unit('beta_pawn_1', 1, 5, { type: 'assistant', group: 'beta_pawn' }),
      unit('beta_pawn_2', 3, 5, { type: 'assistant', group: 'beta_pawn' }),
    ];
    // карта ищет хотя бы одну свободную клетку: min: 1 — и её нет
    expect(
      runFact(state, 'CELLS', { areaOf: 'dorothy', free: true, min: 1 }, { playerId: '0' }),
    ).toMatchObject({ ok: false, value: [] });

    const played = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'common_recall_1',
      playerId: '0',
    });

    expect(played.turn.actionsLeft).toBe(1);
    expect(played.targeting ?? null).toBeNull();
    expect(played.effect ?? null).toBeNull();
    expect(player(played, '0').lost.map(entry => entry.id)).toEqual(['toto']);
  });
});
