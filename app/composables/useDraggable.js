import { onUnmounted, ref } from 'vue';
import { resolveCallback, resolveValue } from '~/utils/reactive.js';

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

  const applyModifiers = (next, context) => {
    const clamp = resolveCallback(options.clamp);
    const bounded = clamp ? (clamp(next, context) ?? next) : next;
    emit('onDrag', bounded, context);
    return bounded;
  };

  let active = null;
  let keyboardMode = false;
  let frame = null;

  const cancelFrame = () => {
    if (frame === null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    frame = null;
  };

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
    document.addEventListener('pointermove', onPointermove);
    document.addEventListener('pointerup', onPointerup);
    document.addEventListener('pointercancel', onPointercancel);
    document.addEventListener('keydown', onEscape);
  };

  const begin = (event, start) => {
    active.started = true;
    isDragging.value = true;
    emit('onStart', { ...start }, contextOf(event, 'start', false, active.element));
  };

  const onPointerdown = event => {
    if (isDisabled() || active || event.button !== 0) return;

    const element = event.currentTarget ?? null;
    try {
      element?.setPointerCapture?.(event.pointerId);
    } catch {
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

  const finish = (event, phase = 'end') => {
    if (!active) return;
    if (event && event.pointerId !== active.pointerId) return;
    const dragged = active;
    active = null;
    stopListening();
    cancelFrame();

    if (dragged.element?.hasPointerCapture?.(dragged.pointerId)) {
      dragged.element.releasePointerCapture(dragged.pointerId);
    }

    if (dragged.pending) {
      writePosition(dragged.pending);
      dragged.pending = null;
    }
    if (!dragged.started) return;

    if (phase === 'cancel') writePosition({ x: dragged.originX, y: dragged.originY });
    isDragging.value = false;

    emit(
      'onEnd',
      readPosition(),
      contextOf(event ?? dragged.lastEvent, phase, false, dragged.element),
    );
  };

  const onPointerup = event => finish(event, 'end');
  const onPointercancel = event => finish(event, 'cancel');

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

  const endKeyboard = event => {
    if (!keyboardMode) return;
    keyboardMode = false;
    isDragging.value = false;
    emit('onEnd', readPosition(), contextOf(event, 'end', true));
  };

  const onKeydown = event => {
    if (!resolveValue(options.keyboard) || isDisabled()) return;

    if (event.key === 'Enter' || event.key === ' ') {
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
    handlers: {
      onPointerdown,
      onKeydown,
      onBlur,
    },
  };
};

export default useDraggable;
