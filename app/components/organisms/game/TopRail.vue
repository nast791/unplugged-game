<template>
  <section class="absolute top-0 right-12 z-30 flex -translate-y-15 flex-row items-start gap-6">
    <FinishButton />

    <RailButton
      :label="TOOLTIPS.rail.move()"
      :disabled="!deckClickable"
      :out="Boolean(movement)"
      @click="onDeckClick()"
    >
      <MoveIcon />
    </RailButton>

    <RailButton
      :label="props.compact ? TOOLTIPS.rail.viewOn() : TOOLTIPS.rail.viewOff()"
      :out="props.compact"
      @click="emit('toggle-view')"
    >
      <Icon :name="props.compact ? 'lucide:minimize-2' : 'lucide:maximize-2'" />
    </RailButton>

    <RailButton :label="TOOLTIPS.rail.log()" disabled>
      <Icon name="lucide:scroll-text" />
    </RailButton>

    <RailButton :label="TOOLTIPS.rail.menu()" @click="openGameMenu()">
      <Icon name="lucide:settings" />
    </RailButton>
  </section>
</template>

<script setup>
import FinishButton from '~/components/molecules/game/FinishButton.vue';
import RailButton from '~/components/molecules/game/RailButton.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { openGameMenu } from '~/composables/ui/useGameMenu.js';
import MoveIcon from '~/svg/game/move.svg';

const props = defineProps({
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle-view']);

const { movement, deckClickable, onDeckClick } = useGameSession();
</script>
