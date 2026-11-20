<template>
  <section v-if="hasText" :class="rootClass" role="status" aria-live="polite" aria-atomic="true">
    <div :class="styles.hints_glow" aria-hidden="true" />

    <div :class="styles.hints_frame">
      <div :class="styles.hints_body">
        <Icon :name="icon" :class="[styles.hints_icon, iconToneClass]" aria-hidden="true" />

        <div class="flex min-w-0 flex-col gap-2">
          <div
            v-if="hasNotice"
            class="text-13 text-accent leading-[1.3] font-semibold"
            data-hint-notice
          >
            {{ props.notice }}
          </div>
          <div :class="[styles.hints_text, textToneClass]" data-hint-text>{{ props.text }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useUI } from '~/composables/ui/useUI';
import { cn } from '~/ui/cn.js';

const props = defineProps({
  text: { type: String, default: '' },
  // строка «Важно!» об активных постоянных эффектах: стоит над сообщением, но окно без сообщения не живёт
  notice: { type: String, default: '' },
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
const hasNotice = computed(() => String(props.notice ?? '').trim() !== '');

const rootClass = computed(() =>
  cn(styles.value.hints_root, 'pointer-events-auto absolute top-12 left-1/2 -translate-x-1/2'),
);
</script>
