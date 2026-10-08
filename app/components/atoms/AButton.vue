<template>
  <button
    v-bind="restAttrs"
    :class="buttonClass"
    :type="props.type"
    :disabled="props.disabled || props.loading"
  >
    <span v-if="props.loading" :class="styles.spinner" aria-hidden="true" />
    <slot v-else name="leading" />

    <span v-if="$slots.default"><slot /></span>

    <slot name="trailing" />
  </button>
</template>

<script setup>
import { useUI } from '~/composables/ui/useUI';

/** Безстилевая кнопка: классы берутся из пресета `button`, вариант — из `variant`. */
defineOptions({ inheritAttrs: false });

const props = defineProps({
  preset: { type: String, default: 'button' },
  variant: { type: String, default: 'primary' },
  type: { type: String, default: 'button' },
  icon: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  ui: { type: Object, default: () => ({}) },
});

const attrs = useAttrs();
const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const buttonClass = computed(() =>
  cn(
    styles.value.button,
    styles.value[`button_${props.variant}`],
    props.icon && styles.value.button_icon,
    props.block && styles.value.button_block,
    props.loading && styles.value.button_loading,
    attrs.class,
  ),
);

const restAttrs = computed(() => {
  const { class: className, ...rest } = attrs;
  return rest;
});
</script>
