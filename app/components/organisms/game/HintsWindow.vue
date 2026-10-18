<template>
  <section
    v-if="hasText"
    ref="root"
    :class="rootClass"
    :style="placeStyle"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    @pointerdown="beginDrag"
  >
    <div :class="styles.hints_glow" aria-hidden="true" />

    <div :class="styles.hints_frame">
      <div ref="body" :class="styles.hints_body">
        <Icon :name="icon" :class="[styles.hints_icon, iconToneClass]" aria-hidden="true" />

        <AScroll :ui="{ scroll_viewport: styles.hints_scroll }">
          <div :class="[styles.hints_text, textToneClass]">{{ props.text }}</div>
        </AScroll>
      </div>
    </div>
  </section>
</template>

<script setup>
import AScroll from '~/components/atoms/AScroll.vue';
import { useDraggable } from '~/composables/ui/useDraggable.js';
import { useUI } from '~/composables/ui/useUI';
import { cn } from '~/ui/cn.js';

const props = defineProps({
  text: { type: String, default: '' },
  tone: { type: String, default: 'hint' },
  preset: { type: String, default: 'hintsWindow' },
  ui: { type: Object, default: () => ({}) },
});

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const ICONS = {
  hint: 'lucide:lightbulb',
  wait: 'lucide:hourglass',
  danger: 'lucide:circle-alert',
};

const tone = computed(() => (props.tone in ICONS ? props.tone : 'hint'));
const icon = computed(() => ICONS[tone.value]);
const iconToneClass = computed(() => styles.value[`hints_icon_${tone.value}`]);
const textToneClass = computed(() => styles.value[`hints_text_${tone.value}`]);

const hasText = computed(() => String(props.text ?? '').trim() !== '');

const root = ref(null);
const body = ref(null);
const place = ref(null);
const size = ref({ width: 0, height: 0 });

const measure = () => {
  const rect = body.value?.getBoundingClientRect?.();
  if (!rect) return;
  size.value = { width: rect.width, height: rect.height };
};
const clampToScreen = next => {
  const maxX = Math.max(0, window.innerWidth - size.value.width);
  const maxY = Math.max(0, window.innerHeight - size.value.height);
  return {
    x: Math.min(Math.max(next.x, 0), maxX),
    y: Math.min(Math.max(next.y, 0), maxY),
  };
};

const { isDragging, handlers } = useDraggable(place, { clamp: clampToScreen });

const beginDrag = event => {
  const rect = root.value?.getBoundingClientRect?.();
  measure();
  if (rect) place.value = { x: rect.left, y: rect.top };
  handlers.onPointerdown(event);
};

const rootClass = computed(() =>
  cn(
    styles.value.hints_root,
    'pointer-events-auto select-none',
    place.value ? 'fixed z-30' : 'absolute top-12 left-1/2 -translate-x-1/2',
    isDragging.value ? 'cursor-grabbing' : 'cursor-grab',
  ),
);

const placeStyle = computed(() => {
  if (!place.value) return null;
  return { left: `${place.value.x}px`, top: `${place.value.y}px` };
});

let observer;

onMounted(() => {
  measure();
  if (typeof ResizeObserver === 'undefined' || !body.value) return;
  observer = new ResizeObserver(measure);
  observer.observe(body.value);
});

watch(
  () => props.text,
  async () => {
    await nextTick();
    measure();
  },
);

onBeforeUnmount(() => observer?.disconnect());
</script>
