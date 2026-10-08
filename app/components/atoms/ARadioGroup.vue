<template>
  <RadioGroupRoot
    v-model="model"
    :class="groupClass"
    :orientation="props.inline ? 'horizontal' : 'vertical'"
    :disabled="props.disabled"
    :name="props.name"
  >
    <span v-if="props.label" :class="styles.radio_group_label">{{ props.label }}</span>

    <slot>
      <ARadio
        v-for="option in props.options"
        :key="option.value"
        :value="option.value"
        :label="option.label"
        :disabled="option.disabled"
      />
    </slot>
  </RadioGroupRoot>
</template>

<script setup>
import { RadioGroupRoot } from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';

/** Группа радиокнопок: `options` — `{ value, label, disabled? }`, либо свои `ARadio` в слоте. */
defineOptions({ inheritAttrs: false });

const props = defineProps({
  options: { type: Array, default: () => [] },
  label: { type: String, default: '' },
  name: { type: String, default: '' },
  inline: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  preset: { type: String, default: 'radioGroup' },
  ui: { type: Object, default: () => ({}) },
});

const model = defineModel({ default: undefined });

const attrs = useAttrs();
const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const groupClass = computed(() =>
  cn(styles.value.radio_group, props.inline && styles.value.radio_group_inline, attrs.class),
);
</script>
