<template>
  <section
    v-if="hasText"
    :class="styles.hints_root"
    role="status"
    aria-live="polite"
    aria-atomic="true"
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
import { useUI } from '~/composables/ui/useUI';

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
</script>
