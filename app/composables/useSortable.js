import { ref } from 'vue';
import { resolveCallback, resolveValue } from '~/composables/useReactiveOptions.js';
import { useDraggable } from './useDraggable.js';

export const SORT_MODES = ['insert', 'swap'];

export const reorder = (list, from, to, mode = 'insert') => {
  const size = Array.isArray(list) ? list.length : 0;
  const next = Array.isArray(list) ? [...list] : [];
  if (from === to) return next;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return next;
  if (from < 0 || to < 0 || from >= size || to >= size) return next;

  if (mode === 'swap') {
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  }

  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export const useSortable = (items, options = {}) => {
  const mode = SORT_MODES.includes(options.mode) ? options.mode : 'insert';
  const selector = options.selector ?? '[data-sortable-index]';
  const draggingIndex = ref(-1);
  const overIndex = ref(-1);

  const cursor = ref({ x: 0, y: 0 });
  let origin = -1;

  const hitTest =
    resolveCallback(options.hitTest) ??
    (point => {
      if (typeof document === 'undefined') return -1;
      const element = document.elementFromPoint(point.x, point.y)?.closest?.(selector);
      const index = Number(element?.dataset?.sortableIndex);
      return Number.isInteger(index) ? index : -1;
    });

  const move = (from, to) => {
    const size = items.value.length;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
    if (from === to || from < 0 || to < 0 || from >= size || to >= size) return null;
    items.value = reorder(items.value, from, to, mode);
    return to;
  };

  const moveBy = (index, step) => move(index, index + Number(step || 0));

  const { isDragging, handlers, cancel } = useDraggable(cursor, {
    disabled: () => Boolean(resolveValue(options.disabled)) || items.value.length < 2,
    threshold: options.threshold ?? 4,
    onStart: () => {
      draggingIndex.value = origin;
    },
    onDrag: (value, context) => {
      overIndex.value = context?.pointer ? hitTest(context.pointer) : -1;
    },
    onEnd: (value, context) => {
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
    handleProps: index => ({
      onPointerdown: event => {
        origin = index;
        handlers.onPointerdown(event);
      },
    }),
    targetProps: index => ({ 'data-sortable-index': index }),
  };
};

export default useSortable;
