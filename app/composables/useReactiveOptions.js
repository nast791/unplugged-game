import { isRef } from 'vue';

export const resolveValue = value => {
  if (isRef(value)) return value.value;
  if (typeof value === 'function') return value();
  return value;
};

export const resolveCallback = value => {
  const raw = isRef(value) ? value.value : value;
  return typeof raw === 'function' ? raw : null;
};
