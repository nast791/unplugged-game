<template>
  <ATooltip :text="TOOLTIPS.discard.bonusCard({ bonus: moveBonus })">
    <span v-if="card" data-bonus-card class="card-bonus-in block origin-bottom scale-[0.72]">
      <Card :card="card" class="shadow-[0_18px_40px_0_rgb(0_0_0/55%)]" />
    </span>
  </ATooltip>
</template>

<script setup>
import ATooltip from '~/components/atoms/ATooltip.vue';
import Card from '~/components/molecules/game/Card.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { cardMoveBonus } from '~/composables/game/useGameHelpers.js';
import { useGameSession } from '~/composables/game/useGameSession.js';

const { bonusCard } = useGameSession();

const card = bonusCard;
const moveBonus = computed(() => cardMoveBonus(bonusCard.value));
</script>
