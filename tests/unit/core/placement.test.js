import { describe, expect, it } from 'vitest';
import { runUi } from '#shared/core.js';
import pickNumHero from '#shared/phases/pickNumHero.js';
import { runAction, runLifecycle } from '#shared/publicApi.js';
import { createState, fighter, PHASES } from '../../fixtures/state.js';

const arenaMap = {
  id: 'arena',
  nodes: [
    { id: 1, neighbors: [6], terrain: 'ice' },
    { id: 6, neighbors: [1], terrain: 'ice', heroStart: true, position: 1 },
    { id: 5, neighbors: [10], terrain: 'lava' },
    { id: 10, neighbors: [5], terrain: 'lava', heroStart: true, position: 2 },
  ],
};

const singleHeroPlayer = (id, heroCell = null) => ({
  id,
  name: id,
  order: id === '0' ? 1 : 2,
  placementReady: false,
  numberedHeroCommitted: false,
  deck: [],
  hand: [],
  discard: [],
  fighters: [
    fighter({
      id: `${id}-hero`,
      type: 'hero',
      currentPosition: heroCell,
      startPosition: heroCell,
      currentHp: 10,
    }),
    fighter({
      id: `${id}-pawn`,
      type: 'assistant',
      currentPosition: null,
      currentHp: 4,
    }),
  ],
});

const placementState = () =>
  createState({
    phase: PHASES.gameStart,
    players: [singleHeroPlayer('0'), singleHeroPlayer('1')],
    map: arenaMap,
  });

/** Клик по клетке расстановки: тот же PICK, что и в ходу. */
const pickCell = (playerId, fighterId, cellId) => ({
  type: 'PICK',
  kind: 'cell',
  playerId,
  fighterId,
  id: cellId,
});

const pickFighter = (playerId, fighterId) => ({
  type: 'PICK',
  kind: 'fighter',
  playerId,
  id: fighterId,
});

describe('core: gameStart placement', () => {
  it('runLifecycle ставит одного героя на номерную клетку в place', () => {
    const state = runLifecycle(placementState());
    const hero = state.players[0].fighters.find(f => f.type === 'hero');
    expect(hero.currentPosition).toBe(6);
    expect(hero.startPosition).toBe(6);
    expect(runUi(state, '0').hint).toContain('Разместите');
  });

  it('PICK клетки + UI_OK → turnStart когда оба игрока готовы', () => {
    let state = runLifecycle(placementState());
    state = runAction(state, pickCell('0', '0-pawn', 1));
    state = runAction(state, { type: 'UI_OK', playerId: '0' });
    state = runAction(state, pickCell('1', '1-pawn', 5));
    state = runAction(state, { type: 'UI_OK', playerId: '1' });
    expect(state.hook).toBe(PHASES.turn);
  });

  it('pickNumHero: preview + UI_OK commit на numbered cell', () => {
    const state = createState({
      phase: PHASES.gameStart,
      players: [
        {
          ...singleHeroPlayer('0'),
          fighters: [
            fighter({ id: 'h1', type: 'hero', currentHp: 10 }),
            fighter({ id: 'h2', type: 'hero', currentHp: 10 }),
            fighter({ id: 'p1', type: 'assistant', currentHp: 3 }),
          ],
        },
      ],
      map: arenaMap,
    });
    const started = runLifecycle(state);
    expect(runUi(started, '0').hint).toContain('Выберите');
    expect(runUi(started, '0').modals?.pickNumHero).toBe(true);

    const preview = runAction(started, pickFighter('0', 'h2'));
    expect(runUi(preview, '0').hint).toContain('Подтвердите');
    expect(runUi(preview, '0').modals?.pickNumHero).toBe(false);
    expect(runUi(preview, '0').controls.ok.enabled).toBe(true);
    const onCell = preview.players[0].fighters.find(f => f.id === 'h2');
    expect(onCell.currentPosition).toBe(6);
    expect(onCell.startPosition).toBe(6);
    expect(preview.players[0].numberedHeroCommitted).toBe(false);

    const committed = runAction(preview, { type: 'UI_OK', playerId: '0' });
    expect(committed.players[0].numberedHeroCommitted).toBe(true);
    expect(runUi(committed, '0').phase).toBe('place');
  });

  it('pickNumHero: UI_BACK снимает preview', () => {
    const state = createState({
      phase: PHASES.gameStart,
      players: [
        {
          ...singleHeroPlayer('0'),
          fighters: [
            fighter({ id: 'h1', type: 'hero', currentHp: 10 }),
            fighter({ id: 'h2', type: 'hero', currentHp: 10 }),
          ],
        },
      ],
      map: arenaMap,
    });
    const started = runLifecycle(state);
    const preview = runAction(started, pickFighter('0', 'h2'));
    const reverted = runAction(preview, { type: 'UI_BACK', playerId: '0' });
    expect(runUi(reverted, '0').hint).toContain('Выберите');
    expect(reverted.players[0].fighters.find(f => f.id === 'h2').currentPosition).toBeNull();
  });

  it('pickNumHero: exit без UI_OK запрещён', () => {
    const state = createState({
      phase: PHASES.gameStart,
      players: [
        {
          ...singleHeroPlayer('0'),
          fighters: [
            fighter({ id: 'h1', type: 'hero', currentHp: 10 }),
            fighter({ id: 'h2', type: 'hero', currentHp: 10 }),
          ],
        },
      ],
      map: arenaMap,
    });
    const started = runLifecycle(state);
    const preview = runAction(started, pickFighter('0', 'h2'));
    expect(() => pickNumHero.exit(preview, '0')).toThrow(/подтверждения/);
  });

  it('отклоняет не тот клик в фазах расстановки', () => {
    const state = runLifecycle(placementState());
    expect(() => runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' })).toThrow(
      /клик по клетке/,
    );
  });
});

describe('runUi: placement highlights', () => {
  it('place phase подсвечивает допустимые клетки для выбранного бойца', () => {
    const state = runLifecycle(placementState());
    const ui = runUi(state, '0', { selectedFighterId: '0-pawn' });
    expect(ui.highlightedCellIds).toContain('1');
    expect(ui.highlightedCellIds).not.toContain('6');
  });

  it('PICK: клетка вне области героя запрещена', () => {
    const state = runLifecycle(
      createState({
        phase: PHASES.gameStart,
        players: [singleHeroPlayer('0')],
        map: {
          id: 'arena',
          nodes: [
            { id: 1, neighbors: [6, 7], terrain: 'ice' },
            { id: 6, neighbors: [1], terrain: 'ice', heroStart: true, position: 1 },
            { id: 7, neighbors: [1], terrain: 'mountains' },
          ],
        },
      }),
    );
    expect(() => runAction(state, pickCell('0', '0-pawn', 7))).toThrow(/одной области/);
  });

  it('place: после UI_OK подсказка ожидания, пока второй игрок не готов', () => {
    let state = runLifecycle(placementState());
    state = runAction(state, pickCell('0', '0-pawn', 1));
    state = runAction(state, { type: 'UI_OK', playerId: '0' });
    const ui = runUi(state, '0');
    expect(ui.phase).toBe('place');
    expect(ui.hint).toContain('Ожидание');
    expect(ui.controls.ok.visible).toBe(false);
  });

  it('область расстановки светится и без выбранного бойца: клетки знают, заняты ли', () => {
    const state = runLifecycle(placementState());
    const ui = runUi(state, '0');

    // под бойца подсветки нет (он не выбран), а область видна сразу
    expect(ui.highlightedCellIds).toEqual([]);
    expect(ui.placementCells).toEqual([
      { id: '1', occupied: false },
      // герой стоит на номерной клетке — она занята
      { id: '6', occupied: true },
    ]);

    // клетка второго игрока в чужую область не попадает
    expect(ui.placementCells.map(cell => cell.id)).not.toContain('5');
  });

  it('занятая своим бойцом клетка области помечается, а не исчезает', () => {
    let state = runLifecycle(placementState());
    state = runAction(state, pickCell('0', '0-pawn', 1));

    expect(runUi(state, '0').placementCells).toEqual([
      { id: '1', occupied: true },
      { id: '6', occupied: true },
    ]);
  });

  it('после подтверждения расстановки область гаснет', () => {
    let state = runLifecycle(placementState());
    state = runAction(state, pickCell('0', '0-pawn', 1));
    state = runAction(state, { type: 'UI_OK', playerId: '0' });

    expect(runUi(state, '0').placementCells).toEqual([]);
  });
});

/**
 * Выставленного бойца можно поднять и переставить, пока не нажата «ОК»: клик по фишке делает его
 * выбранным (`selectFighters`), клик по клетке — тот же `PICK` клетки, что и при расстановке с полки.
 * Раньше клик по фишке в расстановке ничего не выбирал, и боец оставался там, куда его поставили первым.
 */
describe('расстановка: выставленного бойца переставляют до «ОК»', () => {
  const twoCellsMap = {
    id: 'arena',
    nodes: [
      { id: 1, neighbors: [6, 7], terrain: 'ice' },
      { id: 7, neighbors: [1], terrain: 'ice' },
      { id: 6, neighbors: [1], terrain: 'ice', heroStart: true, position: 1 },
      // второй игрок держит расстановку открытой: без него «ОК» первого сразу начнёт партию
      { id: 5, neighbors: [], terrain: 'lava', heroStart: true, position: 2 },
    ],
  };

  const twoCellsState = () =>
    runLifecycle(
      createState({
        phase: PHASES.gameStart,
        players: [singleHeroPlayer('0'), singleHeroPlayer('1')],
        map: twoCellsMap,
      }),
    );

  it('фаза объявляет выбор бойца кликом: selectFighters', () => {
    const state = twoCellsState();
    const placed = runAction(state, pickCell('0', '0-pawn', 1));
    const ready = runAction(placed, { type: 'UI_OK', playerId: '0' });

    expect(state.players[0].placementReady).toBe(false);
    expect(runUi(state, '0').selectFighters).toBe(true);
    // своя расстановка подтверждена — выбирать больше нечего, пока расставляет второй
    expect(ready.players[0].placementReady).toBe(true);
    expect(runUi(ready, '0').selectFighters).toBe(false);
  });

  it('клик по выставленному бойцу зажигает свободные клетки, кроме его собственной', () => {
    const state = twoCellsState();
    const ui = runUi(state, '0', { selectedFighterId: '0-pawn' });

    expect(ui.highlightedCellIds).toEqual(expect.arrayContaining(['1', '7']));
  });

  it('повторный PICK переставляет бойца, а не ставит второго', () => {
    let state = twoCellsState();
    state = runAction(state, pickCell('0', '0-pawn', 1));
    const placed = () => state.players[0].fighters.find(f => f.id === '0-pawn');
    expect(String(placed().currentPosition)).toBe('1');

    state = runAction(state, pickCell('0', '0-pawn', 7));

    expect(String(placed().currentPosition)).toBe('7');
    expect(state.players[0].fighters.filter(f => f.currentPosition != null)).toHaveLength(2);
    // своя прежняя клетка снова свободна, «ОК» по-прежнему доступна
    expect(runUi(state, '0').placementCells).toEqual([
      { id: '1', occupied: false },
      { id: '7', occupied: true },
      { id: '6', occupied: true },
    ]);
    expect(runUi(state, '0').controls.ok.enabled).toBe(true);
  });

  it('главного героя на номерной клетке выбор и перестановка не берут', () => {
    let state = twoCellsState();
    const hero = state.players[0].fighters.find(f => f.type === 'hero');

    expect(runUi(state, '0', { selectedFighterId: hero.id }).highlightedCellIds).toEqual([]);
    expect(() => runAction(state, pickCell('0', hero.id, 1))).toThrow(/номерной клетке/);
  });
});
