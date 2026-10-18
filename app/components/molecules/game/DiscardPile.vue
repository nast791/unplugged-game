<template>
  <div class="flex shrink-0 flex-col items-center gap-6">
    <ATooltip :disabled="placed" :text="tooltip">
      <button
        type="button"
        data-drop="discard"
        class="group flex shrink-0 items-center justify-center"
        :class="placed ? 'cursor-not-allowed' : 'cursor-pointer'"
        :aria-label="circleLabel"
        @click="onCircleClick"
        @mouseenter="hoverCircle = true"
        @mouseleave="hoverCircle = false"
      >
        <span
          class="border-line bg-surface-2 text-ink flex size-44 items-center justify-center rounded-full border-2 shadow-[0_2px_10px_0_rgb(0_0_0/45%)] transition-[transform,filter] duration-200"
          :class="[
            !placed && 'group-hover:-translate-y-4',
            ready && 'discard-bonus-ready',
            over && 'discard-bonus-over',
          ]"
          aria-hidden="true"
        >
          <Icon :name="circleIcon" class="size-24" />
        </span>
      </button>
    </ATooltip>

    <ATooltip :disabled="!active" :text="tooltip">
      <button
        type="button"
        data-drop="discard"
        data-card-anchor="discard"
        class="group rounded-6 border-line bg-surface-2 relative block h-160 w-115 shrink-0 border-2 transition-transform duration-200 disabled:cursor-not-allowed"
        :class="[
          active && 'group-hover:-translate-y-6',
          ready && 'discard-bonus-ready',
          over && 'discard-bonus-over',
        ]"
        :disabled="!active"
        :aria-label="label"
        @click="onPileClick"
      >
        <span class="rounded-4 border-line/70 absolute inset-6 border-2" aria-hidden="true" />

        <div
          v-if="bonusCard"
          data-bonus-slot
          class="pointer-events-none absolute -top-206 left-1/2 -translate-x-1/2"
        >
          <BonusCard />
        </div>

        <span
          v-if="!isPlacement"
          class="text-18 text-ink absolute inset-x-0 bottom-10 text-center font-semibold lining-nums"
        >
          {{ discardCount }}
        </span>
      </button>
    </ATooltip>
  </div>
</template>

<script setup>
import ATooltip from '~/components/atoms/ATooltip.vue';
import BonusCard from '~/components/molecules/game/BonusCard.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { useCardDrag } from '~/composables/ui/useCardDrag.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { openModal } from '~/composables/ui/useModal.js';

const {
  myDiscardCount: discardCount,
  isPlacement,
  canDiscardBonus,
  armedBonusCard,
  onBonusDiscard,
  bonusCard,
} = useGameSession();

const { drag, over: dragOver } = useCardDrag();

const hoverCircle = ref(false);
const armed = computed(() => Boolean(armedBonusCard.value));

const ready = computed(() => canDiscardBonus.value);

const over = computed(() => drag.active && dragOver.value === 'discard');

const empty = computed(() => discardCount.value === 0);

const active = computed(() => !isPlacement.value && (!empty.value || ready.value));

const placed = computed(() => isPlacement.value);

const circleIcon = computed(() => {
  if (ready.value)
    return armed.value && hoverCircle.value ? 'lucide:arrow-down-to-line' : 'lucide:plus';
  return 'lucide:trash-2';
});

const label = computed(() => {
  if (armed.value) return TOOLTIPS.discard.bonusDrop();
  if (isPlacement.value) return TOOLTIPS.discard.placement();
  if (empty.value) return TOOLTIPS.discard.empty();
  return `${TOOLTIPS.discard.count({ count: discardCount.value })}. ${TOOLTIPS.discard.click()}`;
});

const circleLabel = computed(() => (ready.value ? TOOLTIPS.discard.bonusReady() : label.value));

const tooltip = computed(() => {
  if (armed.value) return TOOLTIPS.discard.bonusDrop();
  if (ready.value) return TOOLTIPS.discard.bonusReady();
  return label.value;
});

const onCircleClick = () => {
  if (armed.value) {
    onBonusDiscard();
    return;
  }
  if (placed.value) return;
  openModal('discard');
};

const onPileClick = () => {
  if (!active.value) return;
  openModal('discard');
};
</script>
