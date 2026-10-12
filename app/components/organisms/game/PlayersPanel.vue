<template>
  <section class="flex min-h-0 flex-col">
    <AScroll>
      <div class="flex flex-col gap-8 p-12">
        <PlayerCard
          v-for="player in orderedPlayers"
          :key="player.id"
          :player="player"
          :catalog="heroPack(player.id)"
        />

        <p v-if="!orderedPlayers.length" class="text-16 text-dim">В партии пока нет игроков</p>
      </div>
    </AScroll>
  </section>
</template>

<script setup>
import AScroll from '~/components/atoms/AScroll.vue';
import PlayerCard from '~/components/molecules/game/PlayerCard.vue';
import { useHeroPacks } from '~/composables/api/heroes.js';
import { useGameSession } from '~/composables/useGameSession.js';
import { panelOrder } from '~/composables/useGameHelpers.js';

const { players, you } = useGameSession();

const orderedPlayers = computed(() => panelOrder(players.value, you.value));

const { packs, load } = useHeroPacks();
const heroPack = id => (packs.data.value ?? {})[String(id)] ?? {};
await load();
</script>
