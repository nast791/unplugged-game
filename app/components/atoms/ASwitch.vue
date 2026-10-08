<template>
  <label :class="styles.switch_wrapper">
    <SwitchRoot
      v-model="model"
      :class="styles.switch_root"
      :disabled="props.disabled"
      :name="props.name"
    >
      <SwitchThumb :class="styles.switch_thumb" />
    </SwitchRoot>
    <span v-if="props.label || $slots.default" :class="styles.switch_label">
      <slot>{{ props.label }}</slot>
    </span>
  </label>
</template>

<script setup>
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';

/** Переключатель: одно булево значение, подпись — проп `label` или слот. */
const props = defineProps({
  label: { type: String, default: '' },
  name: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  preset: { type: String, default: 'switch' },
  ui: { type: Object, default: () => ({}) },
});

const model = defineModel({ type: Boolean, default: false });

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);
</script>
