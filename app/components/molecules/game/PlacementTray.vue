<template>
  <div v-if="fighters.length" class="flex flex-col items-center gap-8">
    <AAvatar
      v-for="fighter in fighters"
      :key="fighter.id"
      draggable="true"
      :alt="fighter.name || ''"
      :title="titleOf(fighter)"
      :ui="{
        avatar_root: cn(
          'size-60 cursor-grab border-3 transition-[border-color,box-shadow] active:cursor-grabbing',
          isActive(fighter)
            ? 'border-accent shadow-[0_0_16px_0_var(--color-accent)]'
            : 'border-primary shadow-[0_2px_6px_0_rgb(0_0_0/35%)] hover:border-ink',
        ),
        avatar_fallback: 'bg-surface-2',
      }"
      @click.stop="selectFighter(fighter.id)"
      @dragstart="onDragStart(fighter, $event)"
    />
  </div>
</template>

<script setup>
import AAvatar from '~/components/atoms/AAvatar.vue';
import { useGameSession } from '~/composables/useGameSession.js';

const { placementFighters, selectedFighterId, selectFighter } = useGameSession();

const fighters = placementFighters;

const isActive = fighter => String(selectedFighterId.value ?? '') === String(fighter.id);
const titleOf = fighter =>
  `${fighter.name || fighter.id} · перетащите на подсвеченную клетку или щёлкните по ней`;

/** Захват аватарки сразу делает её активной: клетку под курсором считает доска, ставит бойца экран. */
const onDragStart = (fighter, event) => {
  selectFighter(fighter.id);
  event?.dataTransfer?.setData?.('text/plain', String(fighter.id));
  if (event?.dataTransfer) event.dataTransfer.effectAllowed = 'move';
};
</script>
