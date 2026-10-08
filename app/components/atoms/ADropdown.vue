<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        :class="styles.dropdown_content"
        :align="props.align"
        :side-offset="props.sideOffset"
      >
        <AScroll :ui="styles">
          <slot>
            <template v-for="(item, index) in props.items" :key="item.id || item.heading || index">
              <DropdownMenuSeparator v-if="item.separator" :class="styles.dropdown_separator" />
              <DropdownMenuLabel v-else-if="item.heading" :class="styles.dropdown_label">
                {{ item.heading }}
              </DropdownMenuLabel>
              <DropdownMenuItem
                v-else
                :class="styles.dropdown_item"
                :disabled="item.disabled"
                @select="emit('select', item)"
              >
                <Icon
                  v-if="item.icon"
                  :name="item.icon"
                  :class="styles.dropdown_item_icon"
                  aria-hidden="true"
                />
                {{ item.label }}
              </DropdownMenuItem>
            </template>
          </slot>
        </AScroll>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup>
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';

/**
 * Дропдаун (меню профиля и любые контекстные меню): триггер в слоте `trigger`, пункты — либо массив
 * `{ id, label, icon?, disabled?, separator?, heading? }`, либо свой разметкой в слоте по умолчанию.
 */
const props = defineProps({
  items: { type: Array, default: () => [] },
  align: { type: String, default: 'end' },
  sideOffset: { type: Number, default: 8 },
  preset: { type: String, default: 'dropdown' },
  ui: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['select']);

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);
</script>
