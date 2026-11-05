<template>
  <ATooltip :text="props.label" :side="props.side" :disabled="!props.label">
    <component
      :is="props.clickable ? 'button' : 'div'"
      :type="props.clickable ? 'button' : undefined"
      :disabled="props.clickable ? props.disabled : undefined"
      :aria-label="props.label || undefined"
      :aria-pressed="props.clickable ? Boolean(props.out) : undefined"
      :data-card-anchor="props.anchor || undefined"
      :data-drop="props.drop || undefined"
      class="relative flex shrink-0 flex-col items-center justify-center border-2 transition-[transform,border-color,background-color,color]"
      :class="[box, skin, props.out && props.outClass]"
      @click="emit('click', $event)"
    >
      <span
        v-if="props.pulse"
        class="rounded-6 border-accent pointer-events-none absolute -inset-2 animate-pulse border-2"
        aria-hidden="true"
      />

      <component
        :is="props.glyph"
        v-if="props.glyph"
        :class="props.iconClass || iconSize"
        class="shrink-0"
        aria-hidden="true"
      />

      <Icon
        v-else-if="props.icon"
        :name="props.icon"
        :class="props.iconClass || iconSize"
        class="shrink-0"
      />

      <span
        v-if="props.count != null"
        class="leading-none font-semibold lining-nums"
        :class="props.countClass || countSize"
      >
        {{ props.count }}
      </span>
    </component>
  </ATooltip>
</template>

<script setup>
import ATooltip from '~/components/atoms/ATooltip.vue';

const props = defineProps({
  icon: { type: String, default: '' },
  glyph: { type: [Object, Function], default: null },
  iconClass: { type: String, default: '' },
  countClass: { type: String, default: '' },
  count: { type: Number, default: null },

  label: { type: String, default: '' },
  side: { type: String, default: 'bottom' },

  out: { type: Boolean, default: false },
  outClass: { type: String, default: '' },
  pulse: { type: Boolean, default: false },
  empty: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  clickable: { type: Boolean, default: true },

  anchor: { type: String, default: '' },
  drop: { type: String, default: '' },

  size: { type: String, default: 'sm' },
});

const emit = defineEmits(['click']);

const SIZES = {
  xs: { box: 'h-28 w-24 gap-0 rounded-5', icon: 'size-12', count: 'text-9' },
  sm: { box: 'h-38 w-30 gap-0 rounded-5', icon: 'size-13', count: 'text-9' },
};

const shape = computed(() => SIZES[props.size] ?? SIZES.sm);
const box = computed(() => shape.value.box);
const iconSize = computed(() => shape.value.icon);
const countSize = computed(() => shape.value.count);

const active = computed(() => props.out || props.pulse);

const skin = computed(() => {
  if (props.empty) return 'border-danger bg-danger text-ink';
  if (props.disabled) return 'border-line bg-surface-3 text-dim';
  if (active.value) return 'border-accent bg-surface text-ink';
  return 'border-line bg-surface text-ink hover:border-dim';
});
</script>
