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
        <span
          v-if="line.label"
          class="text-11 mb-4 block font-semibold tracking-[0.08em] uppercase"
          :class="palette.label"
        >
          {{ line.label }}
        </span>
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
    label: 'text-accent',
  },
  page: {
    text: 'text-16 text-dim leading-[1.4]',
    label: 'text-accent',
  },
};

const palette = computed(() => TONES[props.tone] ?? TONES.card);
const blocks = computed(() => cardTextBlocks(props.text));

const isActive = (line, block) => {
  const moment = line.moment ?? block.moment;
  return moment != null && props.highlight.includes(moment);
};
</script>
