<template>
  <TooltipProvider :delay-duration="props.delayDuration">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>

      <TooltipPortal>
        <TooltipContent
          :class="styles.tooltip_content"
          :side="props.side"
          :side-offset="props.sideOffset"
        >
          <slot name="content">{{ props.text }}</slot>
          <TooltipArrow :class="styles.tooltip_arrow" :width="props.arrowSize" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<script setup>
import {
  TooltipArrow,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';

/** Тултип: содержимое в слоте по умолчанию — это триггер, подсказка — проп `text` или слот `content`. */
const props = defineProps({
  text: { type: String, default: '' },
  side: { type: String, default: 'top' },
  sideOffset: { type: Number, default: 6 },
  delayDuration: { type: Number, default: 200 },
  arrowSize: { type: Number, default: 10 },
  preset: { type: String, default: 'tooltip' },
  ui: { type: Object, default: () => ({}) },
});

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);
</script>
