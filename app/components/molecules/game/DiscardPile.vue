<template>
  <ATooltip :disabled="inert" text="Открыть сброс: все сброшенные карты по типам и копиям">
    <button
      type="button"
      class="group flex shrink-0 flex-col items-center gap-6"
      :disabled="inert"
      :aria-label="label"
      @click="openModal('discard')"
    >
      <span
        class="border-line bg-surface-2 text-ink flex size-44 items-center justify-center rounded-full border-2 shadow-[0_2px_10px_0_rgb(0_0_0/45%)] transition-transform duration-200"
        :class="{ 'group-hover:-translate-y-4': !inert }"
        aria-hidden="true"
      >
        <Icon name="lucide:layers" class="size-24" />
      </span>

      <span
        class="rounded-6 border-line bg-surface relative block h-160 w-115 shrink-0 border-2 transition-transform duration-200"
        :class="{ 'group-hover:-translate-y-6': !inert }"
      >
        <span class="rounded-4 border-line/70 absolute inset-6 border-2" />

        <span
          v-if="!isPlacement"
          class="text-18 text-ink absolute inset-x-0 bottom-10 text-center font-semibold lining-nums"
        >
          {{ discardCount }}
        </span>
      </span>
    </button>
  </ATooltip>
</template>

<script setup>
import ATooltip from '~/components/atoms/ATooltip.vue';
import { useGameSession } from '~/composables/useGameSession.js';
import { openModal } from '~/composables/ui/useModal.js';

const { myDiscardCount: discardCount, isPlacement } = useGameSession();

const empty = computed(() => discardCount.value === 0);
const inert = computed(() => isPlacement.value || empty.value);
const label = computed(() => {
  if (isPlacement.value) return 'Сброс: до начала партии недоступен';
  if (empty.value) return 'Сброс пуст';
  return `Сброс: ${discardCount.value} карт. Клик — открыть сброс`;
});
</script>
