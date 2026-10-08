import { ref } from 'vue';
import { SORT_MODES, reorder } from '~/utils/sortable.js';
import { resolveCallback, resolveValue } from '~/utils/reactive.js';
import { useDraggable } from './useDraggable.js';

/**
 * Порядок списка: строку тянут за ручку (`handleProps`) или ставят на другую позицию стрелками
 * (`moveBy`). Строится на `useDraggable` — того же механизма, что и свободное перетаскивание: строке не
 * нужна пиксельная позиция, ей нужна **точка указателя**, поэтому цель ищется под курсором по
 * `data-sortable-index` (`targetProps`), а не по геометрии строк.
 *
 * Режимы (`mode`, по умолчанию `insert`):
 *
 * - `insert` — элемент встаёт **на** указанную позицию, соседи сдвигаются (порядок мест, рука, очередь);
 * - `swap` — два элемента меняются местами (герои меняются стульями, номера позиций остаются).
 *
 * ```vue
 * <script setup>
 * const slots = ref([{ id: 1 }, { id: 2 }]);
 * const { handleProps, targetProps, draggingIndex, overIndex, moveBy } = useSortable(slots);
 * </script>
 *
 * <template>
 *   <div v-for="(slot, index) in slots" :key="slot.id" v-bind="targetProps(index)">
 *     <button type="button" v-bind="handleProps(index)" @keydown.down.prevent="moveBy(index, 1)">
 *       ⠿
 *     </button>
 *   </div>
 * </template>
 * ```
 *
 * Порог начала (по умолчанию 4 px) обязателен: без него клик по ручке считался бы перетаскиванием.
 * Строка сама по себе не движется — показывать перетаскивание (`draggingIndex`) и цель (`overIndex`)
 * решает разметка.
 */
export const useSortable = (items, options = {}) => {
  const mode = SORT_MODES.includes(options.mode) ? options.mode : 'insert';
  const selector = options.selector ?? '[data-sortable-index]';
  const draggingIndex = ref(-1);
  const overIndex = ref(-1);

  // Сортировке пиксельная позиция не нужна: `useDraggable` пишет в неё, и её никто не читает.
  // Точку указателя она отдаёт в контексте — этого хватает, чтобы найти строку под курсором.
  const cursor = ref({ x: 0, y: 0 });
  let origin = -1;

  /**
   * Цель под курсором. По умолчанию — строка с меткой `data-sortable-index` (`targetProps`): во время
   * захвата указателя события идут на ручку, поэтому цель ищут по координатам, а не по `event.target`.
   * Свой `hitTest(point)` нужен тестам (в happy-dom нет раскладки) и нестандартным раскладкам.
   */
  const hitTest =
    resolveCallback(options.hitTest) ??
    (point => {
      if (typeof document === 'undefined') return -1;
      const element = document.elementFromPoint(point.x, point.y)?.closest?.(selector);
      const index = Number(element?.dataset?.sortableIndex);
      return Number.isInteger(index) ? index : -1;
    });

  /** Новый порядок и позиция, куда встал элемент; `null` — порядок не изменился. */
  const move = (from, to) => {
    const size = items.value.length;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
    if (from === to || from < 0 || to < 0 || from >= size || to >= size) return null;
    items.value = reorder(items.value, from, to, mode);
    return to;
  };

  /** Сдвиг на соседнюю позицию — для стрелок: `moveBy(index, -1)` вверх, `moveBy(index, 1)` вниз. */
  const moveBy = (index, step) => move(index, index + Number(step || 0));

  const { isDragging, handlers, cancel } = useDraggable(cursor, {
    // Одна строка — не список, перетаскивать нечего; потребитель может выключить перестановку и сам
    // (`disabled: () => …`) — например, когда порядок задаёт сид, а не разметка.
    disabled: () => Boolean(resolveValue(options.disabled)) || items.value.length < 2,
    threshold: options.threshold ?? 4,
    onStart: () => {
      draggingIndex.value = origin;
    },
    // Колбэки `useDraggable` получают `(значение, контекст)`: первым идёт позиция, контекст — вторым.
    onDrag: (value, context) => {
      overIndex.value = context?.pointer ? hitTest(context.pointer) : -1;
    },
    onEnd: (value, context) => {
      // Бросок применяется только на отпускании: `cancel` (Escape или отобранный указатель) порядок
      // не меняет — строка остаётся там, где была.
      if (context?.phase === 'end') move(origin, overIndex.value);
      origin = -1;
      draggingIndex.value = -1;
      overIndex.value = -1;
    },
  });

  return {
    draggingIndex,
    overIndex,
    isDragging,
    move,
    moveBy,
    cancel,
    /** Хендлеры ручки: указатель тянет строку, клавиши и стрелки обрабатывает разметка (`moveBy`). */
    handleProps: index => ({
      onPointerdown: event => {
        origin = index;
        handlers.onPointerdown(event);
      },
    }),
    /** Метка цели: по ней `elementFromPoint` находит строку под курсором. */
    targetProps: index => ({ 'data-sortable-index': index }),
  };
};

export default useSortable;
