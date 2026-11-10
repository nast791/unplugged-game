<template>
  <div class="flex flex-col gap-4">
    <div v-for="block in blocks" :key="block.key" class="flex flex-col gap-2">
      <div
        v-for="line in block.lines"
        :key="line.key"
        :class="[
          palette.text,
          line.label && 'mt-4',
          isActive(line, block) && 'text-accent font-semibold',
        ]"
        :data-option="line.label || undefined"
      >
        <div v-if="line.label" class="mb-4 flex items-center gap-5" data-option-head>
          <span class="size-4 shrink-0 rounded-full" :class="palette.dot" data-option-dot />
          <span
            class="block font-semibold tracking-[0.08em] uppercase"
            :class="palette.label"
            data-option-label
          >
            {{ line.label }}
          </span>
        </div>
        <span class="block">{{ line.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { cardTextBlocks } from '~/composables/game/useGameHelpers.js';

const props = defineProps({
  text: { type: String, default: '' },
  highlight: { type: Array, default: () => [] },
  tone: { type: String, default: 'card' },
});

const TONES = {
  card: {
    text: 'text-13 font-light text-white',
    label: 'text-11 text-accent',
    dot: 'bg-accent',
  },
  page: {
    text: 'text-16 text-dim leading-[1.4]',
    label: 'text-11 text-accent',
    dot: 'bg-accent',
  },
  zoom: {
    text: 'text-24 font-light text-ink leading-[1.35]',
    label: 'text-15 text-accent',
    dot: 'bg-accent',
  },
};

const palette = computed(() => TONES[props.tone] ?? TONES.card);
const blocks = computed(() => cardTextBlocks(props.text));

const isActive = (line, block) => {
  const moment = line.moment ?? block.moment;
  return moment != null && props.highlight.includes(moment);
};
</script>
