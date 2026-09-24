import { describe, expect, it } from 'vitest';
import { runUi } from '#shared/core.js';
import pickNumHero from '#shared/phases/pickNumHero.js';
import { runAction, runLifecycle } from '#shared/gameEngine.js';
import { createState, fighter, PHASES } from '../../fixtures/state.js';

const arenaMap = {
  id: 'arena',
  nodes: [
    { id: 1, neighbors: [6], position: 1, areas: ['#3B82F6'] },
    { id: 6, neighbors: [1], position: 1, heroStart: true, areas: ['#3B82F6'] },
    { id: 5, neighbors: [10], position: 2, areas: ['#EF4444'] },
    { id: 10, neighbors: [5], position: 2, heroStart: true, areas: ['#EF4444'] },
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
    expect(
      reverted.players[0].fighters.find(f => f.id === 'h2').currentPosition,
    ).toBeNull();
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
    expect(() =>
      runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' }),
    ).toThrow(/клик по клетке/);
  });
});

describe('runUi: placement highlights', () => {
  it('place phase подсвечивает допустимые клетки для выбранного бойца', () => {
    const state = runLifecycle(placementState());
    const ui = runUi(state, '0', { selectedFighterId: '0-pawn' });
    expect(ui.highlightedCellIds).toContain('1');
    expect(ui.highlightedCellIds).not.toContain('6');
  });

  it('PICK: клетка другого цвета запрещена', () => {
    const state = runLifecycle(
      createState({
        phase: PHASES.gameStart,
        players: [singleHeroPlayer('0')],
        map: {
          id: 'arena',
          nodes: [
            { id: 1, neighbors: [6, 7], position: 1, areas: ['#3B82F6'] },
            { id: 6, neighbors: [1], position: 1, heroStart: true, areas: ['#3B82F6'] },
            { id: 7, neighbors: [1], position: 1, areas: ['#94a3b8'] },
          ],
        },
      }),
    );
    expect(() => runAction(state, pickCell('0', '0-pawn', 7))).toThrow(
      /области расстановки/,
    );
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
});
