<template>
  <TabsRoot v-model="model" :class="rootClass" :orientation="props.orientation">
    <TabsList :class="styles.tabs_list">
      <TabsTrigger
        v-for="item in props.items"
        :key="item.id"
        :class="styles.tabs_trigger"
        :value="item.id"
        :disabled="item.disabled"
      >
        {{ item.label }}
      </TabsTrigger>
    </TabsList>

    <TabsContent
      v-for="item in props.items"
      :key="item.id"
      :class="styles.tabs_content"
      :value="item.id"
    >
      <slot :name="item.id" />
    </TabsContent>
  </TabsRoot>
</template>

<script setup>
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';

/** Табы: `items` — `{ id, label, disabled? }`, содержимое — именованные слоты по `id`. */
defineOptions({ inheritAttrs: false });

const props = defineProps({
  items: { type: Array, default: () => [] },
  orientation: { type: String, default: 'horizontal' },
  preset: { type: String, default: 'tabs' },
  ui: { type: Object, default: () => ({}) },
});

const model = defineModel({ default: undefined });

const attrs = useAttrs();
const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const rootClass = computed(() => cn(styles.value.tabs_root, attrs.class));
</script>
