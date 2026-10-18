<template>
  <div :class="rootClass">
    <AScroll>
      <div class="flex flex-col gap-8 p-12">
        <PlayerCard
          v-for="player in orderedPlayers"
          :key="player.id"
          class="pointer-events-auto"
          :player="player"
          :catalog="heroPack(player.id)"
        />

        <p v-if="!orderedPlayers.length" class="text-16 text-dim">В партии пока нет игроков</p>
      </div>
    </AScroll>
  </div>
</template>

<script setup>
import AScroll from '~/components/atoms/AScroll.vue';
import PlayerCard from '~/components/molecules/game/PlayerCard.vue';
import { cn } from '~/ui/cn.js';
import { useHeroPacks } from '~/composables/api/heroes.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { panelOrder } from '~/composables/game/useGameHelpers.js';

const props = defineProps({
  wrapperClass: { type: String, default: '' },
});

const { players, you } = useGameSession();

const orderedPlayers = computed(() => panelOrder(players.value, you.value));

const content = ref(null);
const rootClass = computed(() =>
  cn('pointer-events-none flex min-h-0 flex-col self-end', props.wrapperClass),
);

defineExpose({ fitNode: () => content.value });

const { packs, load } = useHeroPacks();
const heroPack = id => (packs.data.value ?? {})[String(id)] ?? {};
await load();
</script>
