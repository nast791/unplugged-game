<template>
  <ATooltip :disabled="isPlacement" :text="tooltip">
    <button
      type="button"
      class="group flex shrink-0 flex-col items-center gap-6"
      :disabled="isPlacement"
      :aria-label="label"
      @click="onDeckClick"
    >
      <span
        class="border-line bg-surface-2 text-info flex size-44 items-center justify-center rounded-full border-2 shadow-[0_2px_10px_0_rgb(0_0_0/45%)] transition-transform duration-200"
        :class="{ 'group-hover:-translate-y-4': !isPlacement }"
        aria-hidden="true"
      >
        <component :is="MoveIcon" class="size-24" />
      </span>

      <span
        class="rounded-6 border-line bg-surface-2 relative block h-160 w-115 shrink-0 border-2 transition-transform duration-200"
        :class="{ 'group-hover:-translate-y-6': !isPlacement }"
        data-card-anchor="deck"
      >
        <span class="rounded-4 border-line/70 absolute inset-6 border-2" />

        <span
          v-if="!isPlacement"
          class="text-18 text-ink absolute inset-x-0 bottom-10 text-center font-semibold lining-nums"
        >
          {{ deckCount }}
        </span>
      </span>
    </button>
  </ATooltip>
</template>

<script setup>
import ATooltip from '~/components/atoms/ATooltip.vue';
import MoveIcon from '~/svg/game/move.svg';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { useGameSession } from '~/composables/game/useGameSession.js';

const { deckCount, onDeckClick, isPlacement } = useGameSession();

const label = computed(() =>
  isPlacement.value
    ? TOOLTIPS.deck.placement()
    : `${TOOLTIPS.deck.count({ count: deckCount.value })}. ${TOOLTIPS.deck.click()}`,
);

const tooltip = label;
</script>
