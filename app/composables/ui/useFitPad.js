import { computed, onMounted, ref } from 'vue';
import { FIT_PAD_UNITS } from '~/composables/ui/useBoardView.js';

/**
 * Отступ карты от края поля: то же `p-12`, что у панелей, то есть `FIT_PAD_UNITS` единиц сетки.
 * Единица (`--spacing`) считается от ширины окна, поэтому её читаем у элемента поля, а не из константы.
 */
export const useFitPad = element => {
  const spacing = ref(null);

  const measure = () => {
    const el = element?.value;
    if (!el || typeof window === 'undefined') return;
    const raw = window.getComputedStyle(el).getPropertyValue('--spacing');
    const value = Number.parseFloat(raw);
    if (Number.isFinite(value) && value > 0) spacing.value = value;
  };

  onMounted(measure);

  const pad = computed(() => Math.round((spacing.value ?? 0) * FIT_PAD_UNITS) || undefined);

  return { pad, measure };
};

export default useFitPad;
