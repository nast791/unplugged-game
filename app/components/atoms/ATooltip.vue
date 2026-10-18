<template>
  <TooltipProvider :delay-duration="props.delayDuration">
    <TooltipRoot :disabled="props.disabled">
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

          <TooltipArrow
            :class="styles.tooltip_arrow"
            :style="ARROW_STYLE"
            :viewBox="ARROW_VIEW_BOX"
            preserveAspectRatio="none"
          >
            <path :d="ARROW_PATH" />
            <path :d="ARROW_EDGE" :class="styles.tooltip_arrow_edge" />
          </TooltipArrow>
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
import { ARROW_EDGE, ARROW_PATH, ARROW_STYLE, ARROW_VIEW_BOX } from '~/ui/tooltip-arrow.js';
import { useUI } from '~/composables/ui/useUI';

const props = defineProps({
  text: { type: String, default: '' },
  side: { type: String, default: 'top' },
  sideOffset: { type: Number, default: 6 },
  delayDuration: { type: Number, default: 200 },
  preset: { type: String, default: 'tooltip' },
  disabled: { type: Boolean, default: false },
  ui: { type: Object, default: () => ({}) },
});

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);
</script>
