import { isRef } from 'vue';

/**
 * Опции-композаблы принимают и обычное значение, и `ref`, и геттер (`duration: () => limitMs.value`).
 * Разворачивать их через `toValue` нельзя: `toValue` **вызывает** функцию, поэтому колбэк (`clamp`,
 * `onDrag`, `onExpire`) превратился бы в вызов без аргументов. Отсюда два резолвера:
 *
 * - `resolveValue` — значение: `ref` разворачивается, геттер вызывается;
 * - `resolveCallback` — функция или `null` (поддержан и `ref(fn)`).
 */
export const resolveValue = value => {
  if (isRef(value)) return value.value;
  if (typeof value === 'function') return value();
  return value;
};

export const resolveCallback = value => {
  const raw = isRef(value) ? value.value : value;
  return typeof raw === 'function' ? raw : null;
};
