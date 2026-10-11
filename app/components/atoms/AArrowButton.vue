<template>
  <button
    v-bind="restAttrs"
    :class="buttonClass"
    type="button"
    :disabled="props.disabled"
    :aria-label="props.label"
  >
    <Icon :name="icon" :class="styles.arrow_button_icon" aria-hidden="true" />
  </button>
</template>

<script setup>
import { useUI } from '~/composables/ui/useUI';

/** Кнопка-стрелка: сторона в `direction` (`prev` — влево, `next` — вправо). */
defineOptions({ inheritAttrs: false });

const props = defineProps({
  direction: { type: String, default: 'next' },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  preset: { type: String, default: 'arrowButton' },
  ui: { type: Object, default: () => ({}) },
});

const attrs = useAttrs();
const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const icon = computed(() =>
  props.direction === 'prev' ? 'lucide:chevron-left' : 'lucide:chevron-right',
);

const buttonClass = computed(() => cn(styles.value.arrow_button, attrs.class));

const restAttrs = computed(() => {
  const { class: className, ...rest } = attrs;
  return rest;
});
</script>
