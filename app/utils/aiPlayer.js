/**
 * Компьютерный игрок: клиентская обвязка вокруг хода бота.
 *
 * Сам ход считает `bot/play/ai.js` — тот же код, что и в прогонах, поэтому в браузере бот играет с той же
 * силой, что измерена в `docs/hero-balance.md`. Модуль бота подгружается **динамически**: он тянет
 * контент и поиск, и в hotseat-партии (где компьютера нет вовсе) этот кусок не нужен.
 *
 * Бюджет времени на ход — то, ради чего это всё делалось: 200 мс дают около сотни доигрываний, этого
 * хватает, чтобы играть заметно сильнее жадной политики, и ход не выглядит зависанием.
 */
export const AI_TIME_MS = 200;

/** Ходы считаются в цикле: за один ход человека компьютер успевает сделать несколько действий. */
export const AI_MAX_STEPS = 200;

let botPromise = null;

/** Модуль бота грузится один раз на вкладку: в нём контент, поиск и обученная оценка. */
export const loadBot = () => {
  botPromise ??= import('../../bot/play/ai.js');
  return botPromise;
};

export const nextAiMove = async (state, { timeMs = AI_TIME_MS, overrides } = {}) => {
  const { aiStep } = await loadBot();
  return aiStep(state, { timeMs, overrides });
};

/**
 * Цикл компьютера: пока действует слот `ai` — считаем ход и применяем его.
 *
 * `apply` возвращает состояние после хода (его же кладёт в стор клиент, `app/composables/useGameView.js`),
 * `onMove` — точка для интерфейса («компьютер думает», сколько доигрываний успел поиск), `onStall` —
 * «компьютер действует, но действий у него нет»: это тупик правил, и о нём надо сказать вслух.
 * Цикл останавливается, когда ход переходит человеку, партия кончилась или `apply` вернул `null`.
 * `AI_MAX_STEPS` — предохранитель: без него ошибка в правилах превратила бы ход бота в вечный цикл.
 */
export const runAiCycle = async (state, apply, options = {}) => {
  const {
    timeMs = AI_TIME_MS,
    overrides,
    onMove = null,
    onStall = null,
    maxSteps = AI_MAX_STEPS,
  } = options;
  let current = state;

  for (let step = 0; step < maxSteps; step += 1) {
    if (current == null) return null;
    const move = await nextAiMove(current, { timeMs, overrides });
    if (move == null) return current;
    if (move.action == null) {
      if (onStall) onStall(move);
      return current;
    }

    if (onMove) onMove(move);
    current = await apply(move);
  }

  return current;
};

export default runAiCycle;
