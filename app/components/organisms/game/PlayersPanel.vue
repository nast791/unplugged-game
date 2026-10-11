<template>
  <section class="flex min-h-0 flex-col">
    <AScroll>
      <div class="flex flex-col gap-8 p-12">
        <PlayerCard
          v-for="player in orderedPlayers"
          :key="player.id"
          :player="player"
          :catalog="heroPack(player.id)"
          @open-hero="onOpenHero"
        />

        <p v-if="!orderedPlayers.length" class="text-16 text-dim">В партии пока нет игроков</p>
      </div>
    </AScroll>

    <HeroSheet :hero-id="sheetHeroId" @close="sheetHeroId = ''" />
  </section>
</template>

<script setup>
import AScroll from '~/components/atoms/AScroll.vue';
import HeroSheet from '~/components/organisms/modals/HeroSheet.vue';
import PlayerCard from '~/components/molecules/game/PlayerCard.vue';
import { useHeroPacks } from '~/composables/api/heroes.js';
import { useGameSession } from '~/composables/useGameSession.js';
import { panelOrder } from '~/utils/seatOrder.js';

const { players, you } = useGameSession();

const orderedPlayers = computed(() => panelOrder(players.value, you.value));

const { packs, load } = useHeroPacks();
const heroPack = id => (packs.data.value ?? {})[String(id)] ?? {};
await load();

const sheetHeroId = ref('');
const onOpenHero = id => {
  sheetHeroId.value = String(id ?? '');
};
</script>
