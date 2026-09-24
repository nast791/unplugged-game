import { describe, expect, it } from 'vitest';
import gameEnd from '#shared/lifecycle/gameEnd.js';
import gameStart from '#shared/lifecycle/gameStart.js';
import { lifecycleHooks } from '#shared/lifecycle/registry.js';
import turn from '#shared/lifecycle/turn.js';
import turnEnd from '#shared/lifecycle/turnEnd.js';
import turnStart from '#shared/lifecycle/turnStart.js';

/**
 * Смоук-тест структуры: хуки импортируются напрямую и не тянут core.
 * Если у хука появится импорт core (или другого реестра, который тянет хук), этот файл упадёт
 * на «Cannot read properties of undefined (reading 'name')» — так ловится цикл модулей.
 */
describe('lifecycle-модули', () => {
  it('импортируются напрямую и описаны по контракту', () => {
    const hooks = [gameStart, turnStart, turn, turnEnd, gameEnd];

    for (const hook of hooks) {
      expect(typeof hook.name).toBe('string');
      expect(Array.isArray(hook.phases)).toBe(true);
      expect(typeof hook.enter).toBe('function');
      expect(typeof hook.body).toBe('function');
    }

    expect(Object.keys(lifecycleHooks).sort()).toEqual(
      hooks.map(hook => hook.name).sort(),
    );
  });
});
