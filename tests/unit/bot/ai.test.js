import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runAction } from '#shared/publicApi.js';
import { aiSeatIds, aiStep, isAiSeat } from '../../../bot/play/ai.js';
import { actionsFor, actorOf, createDuel, pickWeighted } from '../../../bot/play/duel.js';

/**
 * Ход компьютера (`bot/play/ai.js`) — то, что клиент зовёт в режиме `vs_ai` (`app/composables/useGameAi.js`).
 * Проверяем: компьютер играет только за свои слоты, его ход принимает движок, а цикл «пока ходит
 * компьютер» доводит партию до конца — то есть в браузере та же игра, что и в прогонах.
 *
 * Бюджет поиска в тесте маленький (`FAST`): проверяется связка, а не сила игры — сила измеряется
 * прогонами (`pnpm test:matrix`).
 */
const FAST = { iterations: 4, depth: 6, treeDepth: 1 };

/** Ход человека в тесте: жадная политика над теми же действиями, что предлагает движок. */
const humanMove = (state, rng) => {
  const actor = actorOf(state);
  const options = actionsFor(state, actor, { policy: 'greedy' });
  expect(options.length, `у человека (${actor}) нет ходов`).toBeGreaterThan(0);
  return { actor, action: pickWeighted(rng, options) };
};

/** Довести партию до хода компьютера: расстановку и первые ходы играет человек. */
const advanceToAi = (state, rng, maxSteps = 40) => {
  let current = state;
  for (let step = 0; step < maxSteps; step += 1) {
    const actor = actorOf(current);
    if (actor == null || isAiSeat(current, actor)) return { state: current, actor };
    const move = humanMove(current, rng);
    current = runAction(current, { ...move.action, playerId: move.actor });
  }
  throw new Error('компьютер так и не получил ход');
};

/** Партия против компьютера: за слот `ai` играет `aiStep`, за человека — жадная политика. */
const playVsAi = (seed, maxSteps = 400) => {
  let state = createDuel(seed, `ai_${seed}`, { vsAi: true });
  const rng = { value: seed };
  const moves = { ai: [], human: [] };
  let steps = 0;

  for (; steps < maxSteps && state.hook !== 'gameEnd'; steps += 1) {
    const actor = actorOf(state);
    expect(actor, `шаг ${steps}: не нашлось действующего игрока`).not.toBeNull();

    if (isAiSeat(state, actor)) {
      const move = aiStep(state, { timeMs: 0, overrides: FAST });
      expect(move, `шаг ${steps}: компьютер не нашёл хода`).not.toBeNull();
      expect(String(move.playerId)).toBe(String(actor));
      moves.ai.push(String(move.playerId));
      state = runAction(state, { ...move.action, playerId: move.playerId });
      continue;
    }

    const move = humanMove(state, rng);
    moves.human.push(String(move.actor));
    state = runAction(state, { ...move.action, playerId: move.actor });
  }

  return { state, steps, moves };
};

describe('компьютерный игрок', () => {
  it('места компьютера — это слоты control=ai, в hotseat их нет', () => {
    const vsAi = createDuel(5, 'ai_seats', { vsAi: true });
    expect(aiSeatIds(vsAi)).toEqual(['tesla']);
    expect(isAiSeat(vsAi, 'tesla')).toBe(true);
    expect(isAiSeat(vsAi, 'medusa')).toBe(false);

    const hotseat = createDuel(5, 'ai_seats_hotseat');
    expect(aiSeatIds(hotseat)).toEqual([]);
    expect(isAiSeat(hotseat, 'tesla')).toBe(false);
  });

  it('ход компьютера принимает движок, и он всегда за свой слот', () => {
    const rng = { value: 5 };
    const { state, actor } = advanceToAi(createDuel(5, 'ai_step', { vsAi: true }), rng);
    expect(actor).toBe('tesla');

    const move = aiStep(state, { timeMs: 0, overrides: FAST });
    expect(move?.playerId).toBe('tesla');
    expect(move.iterations).toBeGreaterThan(0);
    expect(() => runAction(state, { ...move.action, playerId: move.playerId })).not.toThrow();
  });

  it('цикл компьютера играет партию до конца и не трогает слот человека', () => {
    for (const seed of [5, 6]) {
      const { state, moves } = playVsAi(seed);
      expect(state.hook, `сид ${seed}: партия не закончилась`).toBe('gameEnd');
      expect(moves.ai.length, `сид ${seed}`).toBeGreaterThan(0);
      expect(new Set(moves.ai)).toEqual(new Set(['tesla']));
      expect(new Set(moves.human)).toEqual(new Set(['medusa']));
    }
  }, 60000);

  /**
   * Ход с бюджетом времени — ровно тот вызов, который делает клиент (`useGameAi` → `aiStep`): лимит
   * доигрываний снят, решение принимает время. Действие при этом должно быть принято движком.
   */
  it('ход по бюджету времени возвращает действие, которое движок принимает', () => {
    const rng = { value: 6 };
    const { state, actor } = advanceToAi(createDuel(6, 'ai_time', { vsAi: true }), rng);
    expect(actor).toBe('tesla');

    const move = aiStep(state, { timeMs: 20 });
    expect(move?.playerId).toBe('tesla');
    expect(move.iterations).toBeGreaterThan(0);
    expect(move.phase).not.toBeNull();
    expect(() => runAction(state, { ...move.action, playerId: move.playerId })).not.toThrow();
  });

  /**
   * Клиент собирает бандл и из этих файлов: если ядро решений потянет `node:` (или серверный реестр
   * партий), страница в браузере упадёт на импорте. Проверка дешёвая, а границу держит.
   */
  it('ядро решений не тянет node и серверный реестр партий', () => {
    const browserSafe = [
      'ai.js',
      'decide.js',
      'search.js',
      'plan.js',
      'value.js',
      'resources.js',
      'axes.js',
      'actionFeatures.js',
      'qvalue.js',
      'matchups.js',
      'counting.js',
      'pool.js',
      'policy.js',
      'cards.js',
      'metrics.js',
    ];

    for (const file of browserSafe) {
      const source = readFileSync(new URL(`../../../bot/play/${file}`, import.meta.url), 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map(match => match[1]);
      for (const target of imports) {
        expect(target.startsWith('node:'), `${file}: ${target}`).toBe(false);
        expect(target.includes('server/create.js'), `${file}: ${target}`).toBe(false);
        expect(target.includes('server/party.js'), `${file}: ${target}`).toBe(false);
      }
    }
  });
});
