<template>
  <div :class="groupClass" role="group" :aria-label="props.label || undefined">
    <span v-if="props.label" :class="styles.checkbox_group_label">{{ props.label }}</span>

    <slot>
      <label
        v-for="option in props.options"
        :key="option.value"
        :class="styles.checkbox_item"
        :data-disabled="option.disabled ? 'true' : undefined"
      >
        <CheckboxRoot
          :model-value="model.includes(option.value)"
          :class="styles.checkbox_control"
          :disabled="option.disabled"
          @update:model-value="toggle(option.value, $event)"
        >
          <CheckboxIndicator>
            <Icon name="lucide:check" :class="styles.checkbox_icon" aria-hidden="true" />
          </CheckboxIndicator>
        </CheckboxRoot>
        <span>{{ option.label }}</span>
      </label>
    </slot>
  </div>
</template>

<script setup>
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';

/**
 * Группа чекбоксов: модель — массив значений. Своего примитива в reka-ui нет (чекбокс одиночный),
 * поэтому группа собирается здесь и остаётся такой же безстилевой.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps({
  options: { type: Array, default: () => [] },
  label: { type: String, default: '' },
  inline: { type: Boolean, default: false },
  preset: { type: String, default: 'checkboxGroup' },
  ui: { type: Object, default: () => ({}) },
});

const model = defineModel({ type: Array, default: () => [] });

const attrs = useAttrs();
const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const toggle = (value, checked) => {
  model.value = checked
    ? [...model.value.filter(item => item !== value), value]
    : model.value.filter(item => item !== value);
};

const groupClass = computed(() =>
  cn(styles.value.checkbox_group, props.inline && styles.value.checkbox_group_inline, attrs.class),
);
</script>
