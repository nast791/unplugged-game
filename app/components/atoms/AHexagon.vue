<template>
  <span :class="styles.hexagon">
    <span :class="styles.hexagon_frame" aria-hidden="true" />
    <span :class="styles.hexagon_body"><slot /></span>
  </span>
</template>

<script setup>
import { useUI } from '~/composables/ui/useUI';

const props = defineProps({
  preset: { type: String, default: 'hexagon' },
  ui: { type: Object, default: () => ({}) },
});

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);
</script>
