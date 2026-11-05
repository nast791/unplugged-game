<template>
  <ATooltip :text="props.label" :disabled="!props.label">
    <button
      type="button"
      :disabled="props.disabled"
      :aria-label="props.label || undefined"
      :aria-pressed="Boolean(props.out)"
      class="rounded-8 relative flex h-80 w-54 shrink-0 flex-col items-center justify-end border-2 pb-20 transition-[transform,border-color,background-color,color]"
      :class="[
        props.out || props.pulse ? 'translate-y-8' : '',
        props.out
          ? 'border-accent bg-surface text-ink'
          : props.disabled
            ? 'border-line bg-surface-2 text-dim'
            : props.pulse
              ? 'border-line bg-surface text-ink'
              : 'border-line bg-surface text-ink hover:border-dim',
      ]"
      @click="emit('click', $event)"
    >
      <span
        v-if="props.pulse"
        class="rounded-8 border-accent pointer-events-none absolute -inset-2 animate-pulse border-2"
        aria-hidden="true"
      />

      <span
        class="flex shrink-0 items-center justify-center [&>svg]:size-24"
        :class="props.pulse && 'text-accent'"
      >
        <slot />
      </span>
    </button>
  </ATooltip>
</template>

<script setup>
import ATooltip from '~/components/atoms/ATooltip.vue';

const props = defineProps({
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  out: { type: Boolean, default: false },
  pulse: { type: Boolean, default: false },
});

const emit = defineEmits(['click']);
</script>
