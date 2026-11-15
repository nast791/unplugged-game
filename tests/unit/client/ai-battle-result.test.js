import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Компьютер и итог битвы (`app/composables/game/useGameAi.js`): пока окно показывает итог битвы,
 * цикл компьютера стоит и не шлёт действий. Иначе в партии против компьютера следующий его ход
 * открывал новый бой и стирал итог раньше, чем игрок успевал его прочитать (m00001).
 *
 * Мокаем только то, что нужно циклу снаружи: смотрящий сторона партии и скорость анимации.
 */
vi.mock('~/composables/ui/useSettings.js', () => ({
  useSettings: () => ({ duration: () => 0 }),
}));

vi.mock('~/composables/game/useGameView.js', async () => {
  const { ref } = await import('vue');
  const { runAction } = await import('#shared/publicApi.js');

  const hostState = ref(null);
  const view = ref({ settings: { heroes: [{ heroId: 'tesla', control: 'ai' }] } });
  const sendAction = vi.fn(async action => {
    hostState.value = runAction(hostState.value, action);
    return hostState.value;
  });

  return { useGameView: () => ({ hostState, view, sendAction }) };
});

import { runAction } from '#shared/publicApi.js';
import { battleResultShown } from '~/composables/game/useBattleView.js';
import { useGameAi, waitForBattleResult } from '~/composables/game/useGameAi.js';
import { useGameView } from '~/composables/game/useGameView.js';
import { isAiSeat } from '../../../bot/play/ai.js';
import { actionsFor, actorOf, createDuel, pickWeighted } from '../../../bot/play/duel.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const waitUntil = async (predicate, ms) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(20);
  }
  return false;
};

/** Довести партию до хода компьютера: расстановку играет человек. */
const advanceToAi = () => {
  let state = createDuel(5, 'client_ai_result', { vsAi: true });
  const rng = { value: 5 };

  for (let step = 0; step < 40; step += 1) {
    const actor = actorOf(state);
    if (actor == null || isAiSeat(state, actor)) return state;
    const options = actionsFor(state, actor, { policy: 'greedy' });
    state = runAction(state, { ...pickWeighted(rng, options), playerId: actor });
  }

  throw new Error('компьютер так и не получил ход');
};

beforeEach(() => {
  battleResultShown().value = false;
});

describe('компьютер ждёт итог битвы', () => {
  it('без итога на экране отпускает сразу', async () => {
    const promise = waitForBattleResult();
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).resolves.toBeUndefined();
  });

  it('не шлёт действий, пока итог на экране, и продолжает после кнопки', async () => {
    const { hostState, sendAction } = useGameView();
    hostState.value = advanceToAi();

    battleResultShown().value = true;
    useGameAi();

    await sleep(400);
    expect(sendAction).not.toHaveBeenCalled();

    battleResultShown().value = false;
    expect(await waitUntil(() => sendAction.mock.calls.length > 0, 15000)).toBe(true);
  }, 30000);
});
