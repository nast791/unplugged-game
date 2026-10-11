import { HINTS } from '#shared/constants/hints.js';

/**
 * Окно подсказок: что экран говорит игроку **прямо сейчас**.
 *
 * Источников подсказки на экране партии несколько, и они спорят друг с другом:
 * фаза движка (`ui.hint` — «возьмите карту из колоды…», «Ход игрока …», «Партия завершена»),
 * ответ клиента (`useGameSession.message` — «клетка сейчас недоступна», ошибка хода) и состояние
 * самого клиента (компьютер думает, ход отправляется). Показывать их нужно **по одному и по
 * старшинству**: пока правила не были сведены в одно место, ошибка пряталась за подсказкой фазы
 * (`hint = ui.hint || message`), а на ходе компьютера подсказка фазы читалась как «твой ход».
 *
 * Сами слова — в словаре (`shared/constants/hints.js`, группа `client`), здесь только старшинство.
 * Функция чистая, без состояния: истории подсказок нет, новая вытесняет старую. Поэтому «один движок
 * подсказок» — это правило старшинства, а не очередь; рисует строку `HintsWindow`.
 */

/** Тон строки: `danger` — так нельзя/ошибка, `wait` — ждём, `hint` — что делать. */
export const HINT_TONES = { danger: 'danger', wait: 'wait', hint: 'hint' };

const line = value => (typeof value === 'string' ? value.trim() : '');

/**
 * Старшинство: ошибка → компьютер → подсказка движка → отправка хода → пусто.
 *
 * Ошибка важнее всего: движок её не повторяет, а подсказка фазы в этот момент устарела.
 * Ход компьютера важнее подсказки фазы: `ui.hint` считается для смотрящего, но в `vs_ai` место
 * человека в этот момент не действует, и «возьмите карту из колоды» — совет не тому.
 * Пусто — окно не рисуем: молчание честнее пустой рамки.
 */
export const resolveGameHint = (input = {}) => {
  const error = line(input.error);
  if (error) return { text: error, tone: HINT_TONES.danger };

  if (input.aiThinking === true) return { text: HINTS.client.aiThinking(), tone: HINT_TONES.wait };

  const hint = line(input.hint);
  if (hint) return { text: hint, tone: HINT_TONES.hint };

  if (input.pending === true) return { text: HINTS.client.sending(), tone: HINT_TONES.wait };

  return null;
};

export default resolveGameHint;
