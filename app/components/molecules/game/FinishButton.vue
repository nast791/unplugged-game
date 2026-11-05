<template>
  <RailButton
    data-ok-control
    :label="TOOLTIPS.rail.ok({ label })"
    :pulse="active"
    :disabled="!active"
    @click="onFinishAction()"
  >
    <Icon name="lucide:check" />
  </RailButton>
</template>

<script setup>
import RailButton from '~/components/molecules/game/RailButton.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { useGameSession } from '~/composables/game/useGameSession.js';

const { okControl, pending, isGameOver, onFinishAction, choicePicked, choiceComplete } =
  useGameSession();

const hasChoice = computed(() => choicePicked.value.length > 0);
const active = computed(
  () =>
    !pending.value &&
    !isGameOver.value &&
    ((hasChoice.value && choiceComplete.value) ||
      (okControl.value.visible === true && okControl.value.enabled === true)),
);
const label = computed(() =>
  hasChoice.value ? 'Подтвердить' : okControl.value.label || 'Завершить действие',
);
</script>
