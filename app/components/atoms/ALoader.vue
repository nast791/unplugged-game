<template>
  <div :class="rootClass" role="status" aria-live="polite">
    <span :class="styles.loader_ring" aria-hidden="true" />
    <p v-if="props.text" :class="styles.loader_text">
      {{ props.text }}<span :class="styles.loader_dot">.</span
      ><span :class="styles.loader_dot">.</span><span :class="styles.loader_dot">.</span>
    </p>
  </div>
</template>

<script setup>
import { useUI } from '~/composables/ui/useUI';

/**
 * Лоадер: кольцо и подпись с бегущими точками (анимация точек — `.loader-dot` в `app/assets/styles.css`).
 * Позиционирование задаёт вызывающий: лоадер лобби растянут на экран классом `absolute inset-0`.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps({
  text: { type: String, default: 'Загрузка' },
  preset: { type: String, default: 'loader' },
  ui: { type: Object, default: () => ({}) },
});

const attrs = useAttrs();
const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const rootClass = computed(() => cn(styles.value.loader_root, attrs.class));
</script>
