import { computed, ref } from 'vue';

/**
 * Тост — одно короткое сообщение поверх экрана (`docs/ui-plan.md` §2): «экран в разработке», «профиль
 * сохранён». Пишет его тот, кто обработал клик, а рисует лобби — поэтому состояние общее, а не локальное.
 *
 * Состояние модульное, как у модалок (`ui/useModal.js`), а не `useState`: сообщение появляется от клика,
 * в SSR-рендере его нет, а `useState` раздавал бы одно сообщение сразу всем запросам.
 */
const TOAST_MS = 2400;

const message = ref('');
let timer = null;

/** Показать сообщение. Новое сообщение заменяет прошлое и перезапускает отсчёт. */
export const notify = (text, duration = TOAST_MS) => {
  message.value = String(text ?? '');
  clearTimeout(timer);
  timer = setTimeout(() => {
    message.value = '';
  }, duration);
};

/** Убрать сообщение сейчас: экран, который его рисует, уходит — висящий тост встретил бы возвращение. */
export const clearToast = () => {
  clearTimeout(timer);
  message.value = '';
};

export const useToast = () => ({
  toast: computed(() => message.value),
  notify,
  clearToast,
});
