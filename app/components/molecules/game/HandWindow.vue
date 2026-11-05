<template>
  <PileWindow name="hand" :title="title" close-label="Закрыть руку">
    <div v-if="cards.length" class="flex flex-wrap gap-12">
      <Card
        v-for="card in cards"
        :key="String(card.instanceId ?? card.id)"
        :card="card"
        :disabled="true"
      />
    </div>

    <p v-else class="text-dim text-15">Эти карты сейчас скрыты от вас — видно только их число</p>
  </PileWindow>
</template>

<script setup>
import Card from '~/components/molecules/game/Card.vue';
import PileWindow from '~/components/molecules/game/PileWindow.vue';
import { sortHandCards } from '~/composables/game/useGameHelpers.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { useModalPayload } from '~/composables/ui/useModal.js';

const { players } = useGameSession();

const payload = useModalPayload('hand');

const player = computed(
  () =>
    (players.value ?? []).find(item => String(item.id) === String(payload.value?.playerId ?? '')) ??
    null,
);

const cards = computed(() =>
  sortHandCards(Array.isArray(player.value?.hand) ? player.value.hand : []),
);

const title = computed(() => {
  const hero = [...(player.value?.fighters ?? []), ...(player.value?.lost ?? [])].find(
    fighter => fighter.type === 'hero',
  );
  const name = hero?.name || player.value?.name || '';
  return name ? `Рука: ${name}` : 'Рука';
});
</script>
