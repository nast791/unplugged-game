<template>
  <button
    type="button"
    class="group relative flex size-152 shrink-0 items-center justify-center rounded-full border-2 text-center transition-[transform,background-color,border-color,box-shadow] duration-200"
    :class="
      active
        ? 'border-accent bg-accent text-primary hover:bg-accent-hover shadow-[0_0_40px_0_var(--color-accent)] hover:scale-105 active:scale-95'
        : 'border-line bg-surface-2 text-ink'
    "
    :disabled="busy || !active"
    :aria-label="label"
    @click="onFinishAction"
  >
    <span
      v-if="active"
      class="border-accent/60 pointer-events-none absolute -inset-6 rounded-full border-2"
      aria-hidden="true"
    />

    <span
      v-if="active"
      class="border-accent/70 pointer-events-none absolute inset-0 animate-ping rounded-full border-4"
      aria-hidden="true"
    />

    <span
      v-if="active"
      class="border-accent/40 pointer-events-none absolute inset-0 animate-ping rounded-full border-4"
      style="animation-delay: 700ms; animation-duration: 1.6s"
      aria-hidden="true"
    />

    <span class="text-18 relative z-10 leading-none font-extrabold uppercase">{{ label }}</span>
  </button>
</template>

<script setup>
import { useGameSession } from '~/composables/useGameSession.js';

const { okControl, pending, isGameOver, onFinishAction, choicePicked } = useGameSession();

const hasChoice = computed(() => choicePicked.value.length > 0);
const active = computed(
  () => hasChoice.value || (okControl.value.visible === true && okControl.value.enabled === true),
);
const busy = computed(() => pending.value || isGameOver.value);
const label = computed(() =>
  hasChoice.value ? 'Подтвердить' : okControl.value.label || 'Завершить',
);
</script>
