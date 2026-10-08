import { describe, expect, it } from 'vitest';
import { runAction } from '#shared/publicApi.js';
import { forkState } from '#shared/helpers/fork.js';
import { actionsFor, actorOf, createDuel } from '../../../bot/play/duel.js';

/**
 * Инвариант: `runAction` не меняет состояние, из которого сделан ход.
 *
 * Кирпичи движка правят вложенные объекты на месте, поэтому ход считается на форке
 * (`shared/helpers/fork.js`). Если в форке не хватает ветки, правка уходит в общее состояние — и тогда
 * молча ломаются сравнение «до/после», откат хода и любая отладка. Тест перебирает **каждое**
 * легальное действие в каждой посещённой позиции (падение движка пропускаем: это отдельная находка
 * фаззинга) и называет первое расхождение путём — по нему ветка добавляется в форк.
 *
 * Снимок делается один раз на позицию, а сравнение — обходом двух деревьев: глубокий клон на каждое
 * действие стоил бы минуты. Широкий прогон: `IMMUTABLE_SEEDS=40 IMMUTABLE_STEPS=200`.
 */
const firstDiff = (before, after, path = 'state') => {
  if (Object.is(before, after)) return null;

  const beforeObject = typeof before === 'object' && before !== null;
  const afterObject = typeof after === 'object' && after !== null;
  if (!beforeObject || !afterObject) {
    return `${path}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`;
  }
  if (Array.isArray(before) !== Array.isArray(after)) {
    return `${path}: массив против объекта`;
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const diff = firstDiff(before[key], after[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
};

const MATCHUPS = [
  ['medusa', 'tesla'],
  ['anubis', 'ifrit'],
  ['dorothy', 'snow-queen'],
  ['ifrit', 'tesla'],
];
const SEED_COUNT = Number(process.env.IMMUTABLE_SEEDS) || 5;
const SEEDS = Array.from({ length: SEED_COUNT }, (_, index) => index + 1);
const MAX_STEPS = Number(process.env.IMMUTABLE_STEPS) || 40;

describe('неизменяемость: ход не трогает состояние, из которого сделан', () => {
  it('форк повторяет состояние один в один: `null` не превращается в пустой список', () => {
    const state = {
      hook: 'turn',
      turn: { playerId: '0', bonus: undefined, actedRound: [] },
      players: [],
      movement: { fighters: null, moves: [], origins: {}, bonus: 0 },
      targeting: null,
      combat: null,
      effect: null,
      reveal: null,
    };
    const forked = forkState(state);

    expect(firstDiff(state, forked)).toBe(null);
    // `fighters: null` значит «ходят все», `[]` — «не ходит никто»: подмена меняет правила
    expect(forked.movement.fighters).toBe(null);
    expect(forked.movement).not.toBe(state.movement);
  });

  it('ни одно легальное действие не меняет входное состояние', () => {
    for (const [heroA, heroB] of MATCHUPS) {
      for (const seed of SEEDS) {
        let state = createDuel(seed, `immutable_${heroA}_${heroB}_${seed}`, { heroA, heroB });
        let probed = 0;

        for (let step = 0; step < MAX_STEPS && state.hook !== 'gameEnd'; step += 1) {
          const playerId = actorOf(state);
          const options = actionsFor(state, playerId, { policy: 'random', style: 3 });
          if (options.length === 0) break;

          // форк — та же партия: значения совпадают, меняются только ссылки на правимые ветки
          expect(
            firstDiff(state, forkState(state)),
            `форк, ${heroA} против ${heroB}, сид ${seed}, шаг ${step}`,
          ).toBe(null);

          const frozen = structuredClone(state);
          const place = `${heroA} против ${heroB}, сид ${seed}, шаг ${step}`;
          for (const option of options) {
            try {
              runAction(state, { ...option.action, playerId });
            } catch {
              // падение движка — находка фаззинга, а не нарушение инварианта
            }
            probed += 1;
            expect(
              firstDiff(frozen, state),
              `${place}, действие ${JSON.stringify(option.action)}`,
            ).toBe(null);
          }

          try {
            state = runAction(state, { ...options[step % options.length].action, playerId });
          } catch {
            break;
          }
        }

        // в партии должно быть что проверять: иначе тест «проходит» на пустом месте
        expect(probed).toBeGreaterThan(20);
      }
    }
  }, 300000);
});
