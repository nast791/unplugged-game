import { onUnmounted, ref } from 'vue';
import { resolveCallback, resolveValue } from '~/utils/reactive.js';

/**
 * Перетаскивание — один раз на всю игру (`docs/ui-plan.md` §5: в игре двигают бойцов, карты, места).
 *
 * Что умеет композабл:
 *
 * - **указатель** (mouse/pen/touch) через Pointer Events; начало — на `pointerdown` по элементу, а
 *   `pointermove`/`pointerup` слушаются на `document` до конца перетаскивания. Это главное решение:
 *   события с элемента теряются, как только указатель ушёл с него (быстрое движение, уход на соседнюю
 *   карточку, отпускание вне блока) — перетаскивание тогда выглядит «не работает». На `document`
 *   отпускание видно всегда, поэтому указатель не «залипает» и следующий захват снова рабочий;
 *   `setPointerCapture` вызывается дополнительно (для тач-браузеров) и обёрнут в try/catch;
 * - **порог начала** (`threshold`): пока указатель не сдвинулся на N пикселей, перетаскивание не
 *   началось — клик по бойцу и перетаскивание бойца расходятся сами;
 * - **блокировка оси** (`axis`), **границы и снап** (`clamp(next, context)`), **отмена** (`Escape`
 *   возвращает позицию на момент захвата, фаза `cancel` в контексте);
 * - **клавиатура** (`keyboard`, по умолчанию выключена): `Enter`/`Space` включают режим перемещения,
 *   стрелки двигают на `keyboardStep`, `Escape`/blur выходят;
 * - **кадры**: несколько `pointermove` за кадр пишут позицию один раз (`requestAnimationFrame`), а
 *   отпускание указателя догоняет последнее смещение.
 *
 * Позиция — **источник правды**, а не внутреннее состояние композабла: подходит и `{ x, y }`, и одно
 * число для одной оси (тогда ось задаёт `axis`). Координаты в пикселях, без привязки к transform или
 * `left/top`: как нарисовать позицию, решает потребитель. Хендлеры вешаются на сам блок
 * (`v-bind="handlers"`) — в них только начало перетаскивания и клавиши.
 *
 * ```vue
 * <script setup>
 * const position = ref({ x: 0, y: 0 });
 * const { handlers, isDragging } = useDraggable(position, {
 *   threshold: 4,
 *   clamp: next => ({ x: Math.min(Math.max(next.x, 0), 400), y: next.y }),
 * });
 * </script>
 *
 * <template>
 *   <div v-bind="handlers" class="touch-none" :style="{ translate: `${position.x}px ${position.y}px` }">
 *     <slot />
 *   </div>
 * </template>
 * ```
 *
 * `touch-none` (`touch-action: none`) на перетаскиваемом блоке — забота потребителя: без него браузер
 * начнёт собственный скролл/зум и `pointermove` перестанут приходить.
 *
 * Колбэки получают `(значение, context)`, где `context` — `{ event, target, phase, keyboard, pointer }`:
 * `phase` — `start` | `drag` | `end` | `cancel`, `target` — элемент, за который взялись, `pointer` —
 * `{ x, y }` клиента или `null` (клавиатура). Точка указателя в контексте нужна тем, кто ищет цель под
 * курсором (`document.elementFromPoint`) — так перестановку списка (`useSortable`) делает тот же
 * механизм, что и свободное перетаскивание.
 */

/** Позиция как объект: `{ x, y }`; одна ось может отсутствовать — тогда её считаем нулём. */
const isObjectPosition = value => value !== null && typeof value === 'object' && 'x' in value;

const resolveAxis = value => {
  const axis = resolveValue(value);
  return axis === 'x' || axis === 'y' ? axis : 'both';
};

const ARROW_DELTAS = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export const useDraggable = (position, options = {}) => {
  const isDragging = ref(false);
  // Ось вычисляется на каждое событие: геттер может зависеть от состояния (`axis: () => ...`).
  const axis = () => resolveAxis(options.axis);
  const isDisabled = () => Boolean(resolveValue(options.disabled));
  const threshold = () => Math.max(0, Number(resolveValue(options.threshold)) || 0);

  const readPosition = () => {
    const value = position.value;
    if (isObjectPosition(value)) return { x: Number(value.x) || 0, y: Number(value.y) || 0 };
    return { x: Number(value) || 0, y: 0 };
  };

  const writePosition = next => {
    if (isObjectPosition(position.value)) {
      position.value = next;
      return;
    }
    position.value = axis() === 'y' ? next.y : next.x;
  };

  const emit = (name, value, context) => {
    const callback = resolveCallback(options[name]);
    if (callback) callback(value, context);
    return value;
  };

  const contextOf = (event, phase, keyboard = false, target = null) => ({
    event,
    target: target ?? event?.currentTarget ?? null,
    phase,
    keyboard,
    pointer: typeof event?.clientX === 'number' ? { x: event.clientX, y: event.clientY } : null,
  });

  /** `clamp` правит позицию, `onDrag` её видит — порядок как в примере владельца. */
  const applyModifiers = (next, context) => {
    const clamp = resolveCallback(options.clamp);
    const bounded = clamp ? (clamp(next, context) ?? next) : next;
    emit('onDrag', bounded, context);
    return bounded;
  };

  // Активный указатель: пока он есть, чужие pointermove/pointerup игнорируем — второй палец или
  // вторая кнопка мыши не должны перехватывать перетаскивание.
  let active = null;
  let keyboardMode = false;
  let frame = null;

  const cancelFrame = () => {
    if (frame === null) return;
    // requestAnimationFrame есть не везде (SSR, часть окружений) — тогда кадров нет вовсе, см. `schedule`.
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    frame = null;
  };

  /**
   * Несколько `pointermove` за кадр пишут позицию один раз: на перетаскивании тяжёлого блока это
   * заметно, а промежуточные значения всё равно не рисуются. Последнее значение лежит в
   * `dragged.pending`, чтобы отпускание указателя не потеряло смещение, если кадр не отрисовался.
   */
  const schedule = (dragged, next) => {
    dragged.pending = next;

    const flush = () => {
      frame = null;
      const pending = dragged.pending;
      if (!pending) return;
      dragged.pending = null;
      writePosition(pending);
    };

    if (typeof requestAnimationFrame !== 'function') {
      flush();
      return;
    }

    cancelFrame();
    frame = requestAnimationFrame(flush);
  };

  const stopListening = () => {
    if (typeof document === 'undefined') return;
    document.removeEventListener('pointermove', onPointermove);
    document.removeEventListener('pointerup', onPointerup);
    document.removeEventListener('pointercancel', onPointercancel);
    document.removeEventListener('keydown', onEscape);
  };

  const startListening = () => {
    if (typeof document === 'undefined') return;
    // `pointerup`/`pointercancel` — на `document`, поэтому отпускание вне блока не «залипает».
    document.addEventListener('pointermove', onPointermove);
    document.addEventListener('pointerup', onPointerup);
    document.addEventListener('pointercancel', onPointercancel);
    document.addEventListener('keydown', onEscape);
  };

  /** Начало перетаскивания: с порогом — только после первого движения, без порога — сразу на нажатие. */
  const begin = (event, start) => {
    active.started = true;
    isDragging.value = true;
    emit('onStart', { ...start }, contextOf(event, 'start', false, active.element));
  };

  const onPointerdown = event => {
    if (isDisabled() || active || event.button !== 0) return;

    const element = event.currentTarget ?? null;
    // Лишний захват указателя: на тач-браузерах он же гасит собственный скролл. Если браузер откажет
    // (нет активного указателя, элемент не в документе) — работаем только на слушателях `document`.
    try {
      element?.setPointerCapture?.(event.pointerId);
    } catch {
      // намеренно молча: захват — подстраховка, а не условие работы
    }

    const start = readPosition();
    active = {
      pointerId: event.pointerId,
      element,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: start.x,
      originY: start.y,
      started: false,
      pending: null,
      lastEvent: event,
    };

    // Слушаем сразу на нажатии, а не в `begin`: первое же движение — то, которое переводит указатель
    // через порог, и оно обязано быть услышанным.
    startListening();
    if (threshold() === 0) begin(event, start);
  };

  const onPointermove = event => {
    if (!active || event.pointerId !== active.pointerId || isDisabled()) return;

    active.lastEvent = event;
    const draggedAxis = axis();
    const deltaX = draggedAxis === 'y' ? 0 : event.clientX - active.pointerX;
    const deltaY = draggedAxis === 'x' ? 0 : event.clientY - active.pointerY;

    if (!active.started) {
      if (Math.hypot(deltaX, deltaY) < threshold()) return;
      begin(event, readPosition());
    }

    const context = contextOf(event, 'drag', false, active.element);
    schedule(
      active,
      applyModifiers({ x: active.originX + deltaX, y: active.originY + deltaY }, context),
    );
  };

  /**
   * Конец перетаскивания. `phase` — `end` (указатель отпущен) или `cancel` (отмена или указатель
   * отобран браузером): в отмене позиция возвращается на момент захвата, `onEnd` видит восстановленное.
   */
  const finish = (event, phase = 'end') => {
    if (!active) return;
    // Отпускание чужого указателя (второй палец) перетаскивание не заканчивает; отмена события не имеет.
    if (event && event.pointerId !== active.pointerId) return;
    const dragged = active;
    active = null;
    stopListening();
    cancelFrame();

    if (dragged.element?.hasPointerCapture?.(dragged.pointerId)) {
      dragged.element.releasePointerCapture(dragged.pointerId);
    }

    // Догоняем последний кадр: отпускание не должно терять смещение.
    if (dragged.pending) {
      writePosition(dragged.pending);
      dragged.pending = null;
    }
    // Нажатие без движения — это клик, а не перетаскивание: колбэки не зовём вовсе.
    if (!dragged.started) return;

    if (phase === 'cancel') writePosition({ x: dragged.originX, y: dragged.originY });
    isDragging.value = false;

    // `currentTarget` живёт только во время обработки события, а в отмене события указателя уже нет:
    // целью в контексте всегда остаётся элемент, за который взялись.
    emit(
      'onEnd',
      readPosition(),
      contextOf(event ?? dragged.lastEvent, phase, false, dragged.element),
    );
  };

  const onPointerup = event => finish(event, 'end');
  // Указатель отобрал браузер (жест ушёл в скролл, второе касание) — это отмена, а не бросок.
  const onPointercancel = event => finish(event, 'cancel');

  /** `Escape` во время перетаскивания — отмена: бросок «мимо» обычное дело, а фокус может быть не на блоке. */
  const onEscape = event => {
    if (event.key !== 'Escape') return;
    cancel();
  };

  const cancel = () => {
    if (active) {
      finish(null, 'cancel');
      return;
    }
    endKeyboard(null);
  };

  /**
   * Клавиатура — опционально (`keyboard: true`), элемент должен быть фокусируемым.
   * `Enter`/`Space` включают режим перемещения, стрелки двигают на `keyboardStep` (по умолчанию 1),
   * `Escape` или blur выходят из режима. `onDrag` вызывается на каждый шаг, `onEnd` — один раз на выходе.
   */
  const endKeyboard = event => {
    if (!keyboardMode) return;
    keyboardMode = false;
    isDragging.value = false;
    emit('onEnd', readPosition(), contextOf(event, 'end', true));
  };

  const onKeydown = event => {
    if (!resolveValue(options.keyboard) || isDisabled()) return;

    if (event.key === 'Enter' || event.key === ' ') {
      // Space на кнопке — ещё и прокрутка страницы: без этого поле «уезжает» под курсором.
      event.preventDefault();
      if (keyboardMode) {
        endKeyboard(event);
        return;
      }
      keyboardMode = true;
      isDragging.value = true;
      emit('onStart', readPosition(), contextOf(event, 'start', true));
      return;
    }

    if (event.key === 'Escape') {
      endKeyboard(event);
      return;
    }

    if (!keyboardMode) return;

    const delta = ARROW_DELTAS[event.key];
    if (!delta) return;
    event.preventDefault();

    const step = Number(resolveValue(options.keyboardStep)) || 1;
    const current = readPosition();
    const draggedAxis = axis();
    const context = contextOf(event, 'drag', true);
    writePosition(
      applyModifiers(
        {
          x: current.x + (draggedAxis === 'y' ? 0 : delta.x * step),
          y: current.y + (draggedAxis === 'x' ? 0 : delta.y * step),
        },
        context,
      ),
    );
  };

  const onBlur = event => endKeyboard(event);

  /** Сброс без колбэков: размонтирование не должно ничего сообщать наружу. */
  const reset = () => {
    stopListening();
    cancelFrame();
    active = null;
    keyboardMode = false;
    isDragging.value = false;
  };

  onUnmounted(reset);

  return {
    isDragging,
    axis,
    cancel,
    reset,
    // Ключи — как у слушателей Vue (`onPointerdown`), иначе объект бесполезен: `v-bind` не преобразует
    // имена (`@pointerdown` это делает компилятор), и `{ pointerdown: fn }` уйдёт обычным атрибутом.
    // Движение и отпускание приходят на `document`, пока идёт перетаскивание, — на элементе их нет.
    handlers: {
      onPointerdown,
      onKeydown,
      onBlur,
    },
  };
};

export default useDraggable;
