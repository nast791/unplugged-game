<template>
  <label :class="styles.checkbox_item" :data-disabled="props.disabled ? 'true' : undefined">
    <CheckboxRoot
      v-model="model"
      :class="styles.checkbox_control"
      :disabled="props.disabled"
      :name="props.name"
    >
      <CheckboxIndicator>
        <Icon name="lucide:check" :class="styles.checkbox_icon" aria-hidden="true" />
      </CheckboxIndicator>
    </CheckboxRoot>
    <span v-if="props.label || $slots.default"
      ><slot>{{ props.label }}</slot></span
    >
  </label>
</template>

<script setup>
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';

/** Чекбокс: одно значение (boolean). Группа — `ACheckboxGroup`. */
const props = defineProps({
  label: { type: String, default: '' },
  name: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  preset: { type: String, default: 'checkbox' },
  ui: { type: Object, default: () => ({}) },
});

const model = defineModel({ type: Boolean, default: false });

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);
</script>
