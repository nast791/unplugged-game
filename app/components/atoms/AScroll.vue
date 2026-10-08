<template>
  <ScrollAreaRoot
    v-bind="restAttrs"
    :class="rootClass"
    :type="props.type"
    :scroll-hide-delay="props.scrollHideDelay"
  >
    <ScrollAreaViewport :class="styles.scroll_viewport">
      <slot />
    </ScrollAreaViewport>

    <ScrollAreaScrollbar v-if="props.vertical" :class="styles.scrollbar_y" orientation="vertical">
      <ScrollAreaThumb :class="styles.thumb_y" />
    </ScrollAreaScrollbar>

    <ScrollAreaScrollbar
      v-if="props.horizontal"
      :class="styles.scrollbar_x"
      orientation="horizontal"
    >
      <ScrollAreaThumb :class="styles.thumb_x" />
    </ScrollAreaScrollbar>

    <ScrollAreaCorner v-if="props.vertical && props.horizontal" :class="styles.scroll_corner" />
  </ScrollAreaRoot>
</template>

<script setup>
import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';

/**
 * Единственный скролл в проекте: применяем везде, в том числе внутри других атомов (модалка, селект,
 * дропдаун, табы) — они прокидывают свой `styles` в проп `ui`, чтобы слоты скролла остались от пресета
 * родителя.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps({
  preset: { type: String, default: 'scroll' },
  type: { type: String, default: 'hover' },
  scrollHideDelay: { type: Number, default: 600 },
  vertical: { type: Boolean, default: true },
  horizontal: { type: Boolean, default: false },
  ui: { type: Object, default: () => ({}) },
});

const attrs = useAttrs();
const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const rootClass = computed(() => cn(styles.value.scroll_root, attrs.class));
const restAttrs = computed(() => {
  const { class: className, ...rest } = attrs;
  return rest;
});
</script>
