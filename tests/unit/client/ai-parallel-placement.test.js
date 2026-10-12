import { describe, expect, it } from 'vitest';
import { createGame } from '../../../server/create.js';
import { load } from '../../../server/party.js';
import { runAction, runUi } from '#shared/publicApi.js';
import { startAreaCellIds, numberedCellId } from '#shared/helpers/placement.js';
import { pendingAiPlacer, runAiCycle, AI_TIME_MS } from '../../../app/composables/useGameAi.js';
import { player } from '../../fixtures/state.js';

/**
 * Расстановка сторон **одновременная**: компьютер доставляет своих бойцов, пока человек расставляет
 * своих, и его плашка «Расстановка» уходит сама — не после чужого «ОК». Очередь здесь не помощник:
 * `actorOf` на расстановке отдаёт первого неподтверждённого, то есть человека, поэтому цикл компьютера
 * берёт слот напрямую (`pendingAiPlacer`).
 *
 * Раньше компьютер ждал «ОК» человека, и до этого шага его карточка не менялась вовсе.
 */
const createVsAi = () => {
  createGame(
    {
      mapId: 'generated',
      mode: 'vs_ai',
      heroes: [
        { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
        { heroId: 'anubis', team: 'B', order: 2, control: 'ai' },
      ],
    },
    { testId: 'ai_parallel_place', testSeed: 5 },
  );
  return load('ai_parallel_place');
};

/** Клик человека по клетке — ровно то, что шлёт доска. */
const humanPick = (state, fighterId, cellId) =>
  runAction(state, {
    type: 'PICK',
    kind: 'cell',
    id: Number(cellId),
    fighterId,
    playerId: 'medusa',
  });

/**
 * Цикл компьютера без пауз: пауза в браузере нужна человеку, тесту — нет. Бюджет поиска — реальный
 * (`AI_TIME_MS`): поиск решает по времени, и на маленьком бюджете под параллельной нагрузкой прогона
 * доигрывания не успевают начаться, решение приходит пустым.
 */
const aiCycle = async state => {
  const moves = [];
  const result = await runAiCycle(
    state,
    async move => {
      moves.push(move);
      // накопление — как в клиенте: следующая итерация обязана увидеть свежее состояние
      state = runAction(state, { ...move.action, playerId: move.playerId });
      return state;
    },
    { timeMs: AI_TIME_MS, pauseMs: 0, onStall: move => moves.push({ stall: move }) },
  );
  return { state: result ?? state, moves };
};

describe('расстановка: компьютер ставит своих, пока человек расставляет своих', () => {
  it('цикл компьютера находит его слот, хотя действующий на расстановке — человек', async () => {
    const created = createVsAi();

    expect(await pendingAiPlacer(created)).toBe('anubis');
    expect(player(created, 'medusa').placementReady).toBe(false);
    expect(player(created, 'anubis').fighters.some(f => f.currentPosition == null)).toBe(true);

    const { state, moves } = await aiCycle(created);

    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every(move => move.playerId === 'anubis')).toBe(true);
    expect(player(state, 'anubis').fighters.every(f => f.currentPosition != null)).toBe(true);
    // главное: слот подтверждён сам, человек в это время ещё не нажимал «ОК»
    expect(player(state, 'anubis').placementReady).toBe(true);
    expect(player(state, 'medusa').placementReady).toBe(false);
    expect(state.hook).toBe('gameStart');
  });

  it('после расстановки компьютер цикл заканчивает сам — ждать ему нечего', async () => {
    const { state } = await aiCycle(createVsAi());

    expect(await pendingAiPlacer(state)).toBeNull();
    expect(runUi(state, 'anubis').controls.ok.visible).toBe(false);
    expect(runUi(state, 'anubis').placementCells).toEqual([]);
  });

  it('человек расставляется после компьютера и партия стартует его «ОК»', async () => {
    const { state: aiDone } = await aiCycle(createVsAi());
    const me = player(aiDone, 'medusa');
    const free = new Set(startAreaCellIds(aiDone, 'medusa').map(String));
    free.delete(String(numberedCellId(aiDone, 'medusa')));

    let run = aiDone;
    for (const fighter of me.fighters) {
      if (fighter.currentPosition != null) {
        free.delete(String(fighter.currentPosition));
        continue;
      }
      const cell = [...free][0];
      free.delete(cell);
      run = humanPick(run, fighter.id, cell);
    }

    expect(run.hook).toBe('gameStart');
    const ready = runAction(run, { type: 'UI_OK', playerId: 'medusa' });
    expect(ready.hook).toBe('turn');
    expect(player(ready, 'anubis').placementReady).toBe(true);
  });
});
