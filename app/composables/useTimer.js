import { computed, getCurrentInstance, onUnmounted, ref, watch } from 'vue';
import { resolveValue } from '~/utils/reactive.js';

/**
 * Таймер с **меткой дедлайна**, а не с интервалом.
 *
 * `setInterval` для этого не годится: его тики дрейфуют (за десять минут уезжают на секунды), а в фоновой
 * вкладке браузер режет таймеры до одного раза в минуту — интервал «замирает» вместе с показаниями.
 * Метка времени (`deadline = Date.now() + duration`) не врёт никогда: показываем **производную**
 * `deadline - now`, поэтому замирает только отрисовка, а после возврата во вкладку число сразу верное.
 * Тик нужен лишь на то, чтобы пересчитать показ (`tickMs`, по умолчанию 250 мс) — и он же один раз
 * замечает истечение.
 *
 * Время партии в состояние движка не кладём: `state` воспроизводим по сиду, и `Date.now()` внутри правил
 * сломал бы воспроизводимость (партии гоняют бот и тесты на неизменность). Таймер — вещь клиента.
 *
 * ```js
 * const { label, expired, restart } = useTimer({ duration: () => limitMs.value, onExpire: notify });
 * watch(turnKey, restart, { immediate: true });
 * ```
 *
 * `duration` — число, `ref` или геттер: лимит приходит из настроек партии и может меняться. `0` значит
 * «без лимита» — таймер не запускается вовсе.
 */
export const useTimer = (options = {}) => {
  const duration = () => Math.max(0, Number(resolveValue(options.duration)) || 0);
  const tickMs = () => Math.max(16, Number(resolveValue(options.tickMs)) || 250);

  const now = ref(Date.now());
  const deadline = ref(0);
  const running = ref(false);
  const expired = ref(false);
  let tick = null;

  const remaining = computed(() =>
    running.value ? Math.max(0, deadline.value - now.value) : expired.value ? 0 : duration(),
  );
  const seconds = computed(() => Math.ceil(remaining.value / 1000));
  /** Показ «M:SS» — таймер отдаёт готовую строку, чтобы формат не разъезжался по экранам. */
  const label = computed(() => {
    const total = Math.max(0, seconds.value);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  });

  const stopTick = () => {
    if (tick === null) return;
    clearTimeout(tick);
    tick = null;
  };

  const onVisibility = () => {
    if (!running.value) return;
    // Вкладка вернулась из фона: тик мог не сработать — пересчитываем показ сразу.
    now.value = Date.now();
    check();
  };

  const listen = () => {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', onVisibility);
  };

  const unlisten = () => {
    if (typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', onVisibility);
  };

  const schedule = () => {
    stopTick();
    tick = setTimeout(() => {
      now.value = Date.now();
      check();
    }, tickMs());
  };

  const check = () => {
    if (!running.value) return;
    if (now.value < deadline.value) {
      schedule();
      return;
    }
    stop();
    expired.value = true;
    const callback = typeof options.onExpire === 'function' ? options.onExpire : null;
    if (callback) callback();
  };

  const start = () => {
    const total = duration();
    if (total <= 0) {
      stop();
      return;
    }
    deadline.value = Date.now() + total;
    now.value = Date.now();
    expired.value = false;
    running.value = true;
    listen();
    schedule();
  };

  const stop = () => {
    stopTick();
    unlisten();
    running.value = false;
  };

  /** Перезапуск с нуля: смена хода, новый лимит из настроек. */
  const restart = () => {
    stop();
    start();
  };

  const reset = () => {
    stop();
    expired.value = false;
    deadline.value = 0;
    now.value = Date.now();
  };

  // Таймер — вещь компонента: вне его (в тестах) просто не подписываемся на размонтирование.
  if (getCurrentInstance()) onUnmounted(reset);

  // Лимит поменяли в настройках — показываем новое значение, а не досиживаем старое.
  watch(duration, (next, previous) => {
    if (next === previous) return;
    restart();
  });

  return {
    remaining,
    seconds,
    label,
    running,
    expired,
    deadline,
    start,
    stop,
    restart,
    reset,
  };
};

export default useTimer;
