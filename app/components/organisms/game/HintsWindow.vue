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
      <div :class="styles.hints_body">
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
import { useDraggable } from '~/composables/useDraggable.js';
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

/** Пустой подсказки не бывает: нет текста — нет и окна, вместе с рамкой и свечением. */
const hasText = computed(() => String(props.text ?? '').trim() !== '');

/**
 * Окно можно перетащить в любое место экрана — в том числе на шапку: пока его не тронули, оно стоит
 * в разметке (по центру под шапкой), а с первого захвата переезжает в `fixed` с координатами экрана.
 * Место запоминается до конца партии: компонент живёт вместе с экраном, а не с очередной подсказкой.
 */
const root = ref(null);
const place = ref(null);
const size = ref({ width: 0, height: 0 });

const clampToScreen = next => {
  const maxX = Math.max(0, window.innerWidth - size.value.width);
  const maxY = Math.max(0, window.innerHeight - size.value.height);
  return {
    x: Math.min(Math.max(next.x, 0), maxX),
    y: Math.min(Math.max(next.y, 0), maxY),
  };
};

const { isDragging, handlers } = useDraggable(place, { clamp: clampToScreen });

/** Координаты и ширину берём у самого окна: они и становятся его местом на экране. */
const beginDrag = event => {
  const rect = root.value?.getBoundingClientRect?.();
  if (rect) {
    size.value = { width: rect.width, height: rect.height };
    place.value = { x: rect.left, y: rect.top };
  }
  handlers.onPointerdown(event);
};

const rootClass = computed(() =>
  cn(
    styles.value.hints_root,
    'pointer-events-auto select-none',
    place.value && 'fixed z-30',
    isDragging.value ? 'cursor-grabbing' : 'cursor-grab',
  ),
);

const placeStyle = computed(() => {
  if (!place.value) return null;
  const style = { left: `${place.value.x}px`, top: `${place.value.y}px` };
  if (size.value.width > 0) style.width = `${size.value.width}px`;
  return style;
});
</script>
