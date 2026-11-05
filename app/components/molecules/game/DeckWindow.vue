<template>
  <PileWindow name="deck" :title="title" close-label="Закрыть колоду">
    <div v-if="cards.length" class="flex flex-wrap gap-12">
      <Card
        v-for="card in cards"
        :key="String(card.instanceId ?? card.id)"
        :card="card"
        :disabled="true"
      />
    </div>

    <p v-else class="text-dim text-15">Эти карты лежат в закрытой колоде — видно только их число</p>

    <p class="text-17 font-semibold lining-nums">Карт в колоде: {{ count }}</p>
  </PileWindow>
</template>

<script setup>
import Card from '~/components/molecules/game/Card.vue';
import PileWindow from '~/components/molecules/game/PileWindow.vue';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { useModalPayload } from '~/composables/ui/useModal.js';

const { players } = useGameSession();

const payload = useModalPayload('deck');

const player = computed(
  () =>
    (players.value ?? []).find(item => String(item.id) === String(payload.value?.playerId ?? '')) ??
    null,
);

const cards = computed(() => (Array.isArray(player.value?.deck) ? player.value.deck : []));

const count = computed(() => Number(player.value?.deckCount ?? player.value?.deck?.length ?? 0));

const title = computed(() => {
  const hero = [...(player.value?.fighters ?? []), ...(player.value?.lost ?? [])].find(
    fighter => fighter.type === 'hero',
  );
  const name = hero?.name || player.value?.name || '';
  return name ? `Колода: ${name}` : 'Колода';
});
</script>
