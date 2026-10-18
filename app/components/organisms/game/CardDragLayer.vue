<template>
  <Teleport to="body">
    <span
      v-if="drag.active"
      ref="host"
      class="pointer-events-none fixed top-0 left-0 z-40 block will-change-transform"
      :style="{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }"
      aria-hidden="true"
    />
  </Teleport>
</template>

<script setup>
import { useCardDrag } from '~/composables/ui/useCardDrag.js';

const { drag } = useCardDrag();

const host = ref(null);

const offset = computed(() => ({
  x: drag.x - drag.width / 2,
  y: drag.y - drag.height / 2,
}));

const build = () => {
  const node = host.value;
  if (!node) return;
  const source = document.querySelector(`[data-hand-card][data-card-key="${drag.key}"]`);
  node.innerHTML = source ? source.outerHTML : '';
  const clone = node.firstElementChild;
  if (clone) {
    clone.style.margin = '0';
    clone.style.transform = 'none';
  }

  for (const child of node.querySelectorAll('*')) {
    child.style.pointerEvents = 'none';
  }
  node.style.width = `${drag.width}px`;
  node.style.height = `${drag.height}px`;
};

watch(
  () => [drag.active, drag.key],
  async () => {
    await nextTick();
    build();
  },
  { immediate: true },
);
</script>
