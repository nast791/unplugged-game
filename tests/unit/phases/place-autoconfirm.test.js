import { describe, expect, it } from 'vitest';
import { createGame } from '../../../server/create.js';
import { load } from '../../../server/party.js';
import { runAction, runUi } from '#shared/publicApi.js';
import { startAreaCellIds, numberedCellId } from '#shared/helpers/placement.js';
import { aiStep, think } from '../../../bot/play/ai.js';
import { AI_TIME_MS } from '../../../app/composables/game/useGameAi.js';
import { player } from '../../fixtures/state.js';

const create = () => {
  createGame(
    {
      mapId: 'generated',
      mode: 'hotseat',
      heroes: [
        { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
        { heroId: 'tesla', team: 'B', order: 2, control: 'human' },
      ],
    },
    { testId: 'place_auto', testSeed: 5 },
  );
  return load('place_auto');
};

const placeAll = (state, playerId = 'medusa') => {
  let run = state;
  const p = player(run, playerId);
  const free = new Set(startAreaCellIds(run, playerId).map(String));
  free.delete(String(numberedCellId(run, playerId)));
  for (const fighter of p.fighters) {
    if (fighter.currentPosition != null) {
      free.delete(String(fighter.currentPosition));
      continue;
    }
    const cell = [...free][0];
    free.delete(cell);
    run = runAction(run, {
      type: 'PICK',
      kind: 'cell',
      id: Number(cell),
      fighterId: fighter.id,
      playerId,
    });
  }
  return run;
};

describe('расстановка: подтверждение без нажатия «ОК»', () => {
  it('герой без помощников подтверждается сам: расставлять нечего, двигать его нельзя', () => {
    const state = create();

    expect(player(state, 'tesla').placementReady).toBe(true);
    expect(player(state, 'tesla').fighters).toHaveLength(1);
    expect(player(state, 'tesla').fighters[0].currentPosition).toBe(numberedCellId(state, 'tesla'));
    // игра всё ещё в расстановке: ждём второго игрока
    expect(state.hook).toBe('gameStart');
    expect(runUi(state, 'tesla').hint).toBe('Ожидание расстановки бойцов всех игроков');
  });

  it('у кого есть кого расставлять — «ОК» остаётся за игроком', () => {
    const created = create();
    expect(player(created, 'medusa').placementReady).toBe(false);

    const placed = placeAll(created);
    expect(player(placed, 'medusa').placementReady).toBe(false);
    expect(placed.hook).toBe('gameStart');

    const ready = runAction(placed, { type: 'UI_OK', playerId: 'medusa' });

    expect(player(ready, 'medusa').placementReady).toBe(true);
    expect(ready.hook).toBe('turn');
    expect(ready.turn.playerId).toBe('medusa');
  });

  it('все бойцы стоят — подсказка просит подтвердить, а не расставлять', () => {
    const placed = placeAll(create());

    expect(runUi(placed, 'medusa').hint).toBe(
      'Все бойцы расставлены — подтвердите расстановку кнопкой «ОК»',
    );
  });
});

describe('расстановка: компьютер подтверждается сам', () => {
  /** Партия в `vs_ai`: человек первым местом, компьютер вторым — расстановка идёт по местам. */
  const createVsAi = (aiHeroId = 'anubis') => {
    createGame(
      {
        mapId: 'generated',
        mode: 'vs_ai',
        heroes: [
          { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
          { heroId: aiHeroId, team: 'B', order: 2, control: 'ai' },
        ],
      },
      { testId: 'place_ai', testSeed: 5 },
    );
    return load('place_ai');
  };

  /** Человек расставил бойцов и подтвердил кнопкой — ход за компьютером. */
  const humanReady = () => {
    const placed = placeAll(createVsAi(), 'medusa');
    return runAction(placed, { type: 'UI_OK', playerId: 'medusa' });
  };

  /**
   * Расстановка компьютера его же кодом (`bot/play/ai.js`), как это делает клиент в `vs_ai`. Ход берём
   * у `think` для самого компьютера: в живой партии он и есть действующий (`actorOf`), а здесь второй слот
   * — чтобы не зависеть от порядка мест.
   */
  const aiPlaceAll = state => {
    let run = state;
    const moves = [];
    for (let step = 0; step < 24; step += 1) {
      const { action } = think(run, 'anubis', { timeMs: AI_TIME_MS });
      if (action == null) break;
      moves.push(action);
      run = runAction(run, { ...action, playerId: 'anubis' });
    }
    return { state: run, moves };
  };

  it('после последнего бойца слот компьютера готов, не дожидаясь конца расстановки', () => {
    const { state, moves } = aiPlaceAll(humanReady());

    expect(moves.length).toBeGreaterThan(0);
    expect(player(state, 'anubis').fighters.every(f => f.currentPosition != null)).toBe(true);
    expect(player(state, 'anubis').placementReady).toBe(true);
    expect(player(state, 'medusa').placementReady).toBe(true);
    expect(state.hook).toBe('turn');
  });

  /**
   * Компьютер доходит до состояния «расстановка подтверждена» ровно на своём последнем бойце: решений
   * движок ему больше не предлагает (`aiStep` пуст), значит и цикл клиента
   * (`app/composables/game/useGameAi.js`) останавливается сам — ждать ему нечего.
   */
  it('готовому компьютеру движок больше не предлагает решений — цикл останавливается сам', () => {
    const before = humanReady();

    expect(aiStep(before, { timeMs: AI_TIME_MS })?.playerId).toBe('anubis');

    const { state } = aiPlaceAll(before);

    expect(think(state, 'anubis', { timeMs: AI_TIME_MS }).action).toBeNull();
    expect(aiStep(state, { timeMs: AI_TIME_MS })).toBeNull();
    expect(runUi(state, 'anubis').controls.ok.visible).toBe(false);
    expect(state.hook).toBe('turn');
  });

  it('компьютер подтверждается до того, как человек нажал «ОК»: подсказка расстановки у него гаснет', () => {
    const humanPlaced = placeAll(createVsAi(), 'medusa');

    expect(player(humanPlaced, 'medusa').placementReady).toBe(false);
    expect(runUi(humanPlaced, 'medusa').hint).toBe(
      'Все бойцы расставлены — подтвердите расстановку кнопкой «ОК»',
    );
    // партия ждёт человека: компьютер подтвердится сам, когда до него дойдёт очередь
    expect(humanPlaced.hook).toBe('gameStart');
  });

  it('герой без помощников (у компьютера) подтверждается сам, как только человек расставился', () => {
    const state = createVsAi('tesla');

    expect(player(state, 'tesla').placementReady).toBe(true);
    expect(state.hook).toBe('gameStart');

    const ready = runAction(placeAll(state, 'medusa'), { type: 'UI_OK', playerId: 'medusa' });

    expect(ready.hook).toBe('turn');
  });
});
