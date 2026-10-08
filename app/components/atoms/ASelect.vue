<template>
  <SelectRoot v-model="model" :disabled="props.disabled" :name="props.name">
    <SelectTrigger :class="styles.select_trigger" :aria-label="props.ariaLabel || undefined">
      <SelectValue :class="styles.select_value" :placeholder="props.placeholder" />
      <SelectIcon class="shrink-0">
        <Icon name="lucide:chevron-down" :class="styles.select_icon" aria-hidden="true" />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent :class="styles.select_content" position="popper" :side-offset="6">
        <AScroll :ui="styles">
          <SelectViewport :class="styles.select_viewport">
            <slot>
              <template v-for="option in props.options" :key="option.value">
                <SelectSeparator v-if="option.separator" :class="styles.select_separator" />
                <SelectItem
                  v-else
                  :class="styles.select_item"
                  :value="option.value"
                  :disabled="option.disabled"
                >
                  <SelectItemText>{{ option.label }}</SelectItemText>
                  <SelectItemIndicator :class="styles.select_item_indicator">
                    <Icon name="lucide:check" class="size-16" aria-hidden="true" />
                  </SelectItemIndicator>
                </SelectItem>
              </template>
            </slot>
          </SelectViewport>
        </AScroll>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<script setup>
/**
 * Список всегда в общем скролле: длинные списки героев не растягивают окно.
 */
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';

/** Селект: `options` — `{ value, label, disabled?, separator? }`, либо свой список в слоте. */
const props = defineProps({
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  name: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  preset: { type: String, default: 'select' },
  ui: { type: Object, default: () => ({}) },
});

const model = defineModel({ default: undefined });

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);
</script>
