<template>
  <RadioGroupItem :class="styles.radio_item" :value="props.value" :disabled="props.disabled">
    <span :class="styles.radio_control">
      <RadioGroupIndicator :class="styles.radio_indicator" />
    </span>
    <span
      ><slot>{{ props.label }}</slot></span
    >
  </RadioGroupItem>
</template>

<script setup>
import { RadioGroupIndicator, RadioGroupItem } from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';

/** Радиокнопка: живёт внутри `ARadioGroup` (обязательное условие reka-ui), классы — из пресета `radio`. */
const props = defineProps({
  value: { type: String, required: true },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  preset: { type: String, default: 'radio' },
  ui: { type: Object, default: () => ({}) },
});

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);
</script>
