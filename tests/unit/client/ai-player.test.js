import { describe, expect, it } from 'vitest';
import { runAction } from '#shared/publicApi.js';
import { runAiCycle } from '../../../app/utils/aiPlayer.js';
import { aiStep, isAiSeat } from '../../../bot/play/ai.js';
import { actionsFor, actorOf, createDuel, pickWeighted } from '../../../bot/play/duel.js';

/**
 * Клиентская обвязка компьютера (`app/utils/aiPlayer.js`): цикл, который играет за слоты `ai`, пока ход
 * не вернётся человеку. Проверяем то, что клиент делает на самом деле: ходы применяются по одному тем же
 * `runAction`, останавливается цикл на ходе человека, а не на середине хода компьютера.
 *
 * Бюджет поиска маленький: проверяется связка, а не сила игры.
 */
const FAST = { iterations: 4, depth: 6, treeDepth: 1 };

/** Довести партию до хода компьютера: расстановку играет человек. */
const advanceToAi = () => {
  let state = createDuel(5, 'client_ai', { vsAi: true });
  const rng = { value: 5 };

  for (let step = 0; step < 40; step += 1) {
    const actor = actorOf(state);
    if (actor == null || isAiSeat(state, actor)) return state;
    const options = actionsFor(state, actor, { policy: 'greedy' });
    state = runAction(state, { ...pickWeighted(rng, options), playerId: actor });
  }

  throw new Error('компьютер так и не получил ход');
};

describe('цикл компьютера в клиенте', () => {
  it('играет за компьютер, пока ход не вернётся человеку', async () => {
    let state = advanceToAi();
    const applied = [];

    const result = await runAiCycle(
      state,
      move => {
        applied.push(String(move.playerId));
        state = runAction(state, { ...move.action, playerId: move.playerId });
        return state;
      },
      { timeMs: 0, overrides: FAST },
    );

    expect(applied.length).toBeGreaterThan(0);
    expect(new Set(applied)).toEqual(new Set(['tesla']));
    expect(result).toBe(state);
    // цикл встал там, где дальше решает человек: либо его ход, либо партия кончилась
    const actor = actorOf(state);
    expect(actor == null || !isAiSeat(state, actor)).toBe(true);
  }, 30000);

  it('на ходе человека не делает ничего и не трогает состояние', async () => {
    const state = createDuel(5, 'client_ai_human', { vsAi: true });
    // первым расставляется человек: компьютер тут не действует
    expect(isAiSeat(state, actorOf(state))).toBe(false);

    let applied = 0;
    const result = await runAiCycle(
      state,
      move => {
        applied += 1;
        return runAction(state, { ...move.action, playerId: move.playerId });
      },
      { timeMs: 0, overrides: FAST },
    );

    expect(applied).toBe(0);
    expect(result).toBe(state);
  }, 30000);

  it('ход компьютера в клиенте — тот же код, что в прогонах', async () => {
    const state = advanceToAi();
    const move = aiStep(state, { timeMs: 0, overrides: FAST });
    expect(move?.playerId).toBe('tesla');
    expect(() => runAction(state, { ...move.action, playerId: move.playerId })).not.toThrow();
  }, 30000);
});
