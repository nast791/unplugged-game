<template>
  <RailButton
    data-ok-control
    :label="TOOLTIPS.rail.ok({ label })"
    :pulse="active"
    :disabled="!active"
    @click="click"
  >
    <Icon name="lucide:check" />
  </RailButton>
</template>

<script setup>
import RailButton from '~/components/molecules/game/RailButton.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { battleResultShown, dismissBattleResult } from '~/composables/game/useBattleGate.js';

const { okControl, pending, isGameOver, onFinishAction, choicePicked, choiceComplete } =
  useGameSession();

const hasChoice = computed(() => choicePicked.value.length > 0);
const closing = computed(() => battleResultShown().value === true);
const active = computed(
  () =>
    !pending.value &&
    !isGameOver.value &&
    (closing.value ||
      (hasChoice.value && choiceComplete.value) ||
      (okControl.value.visible === true && okControl.value.enabled === true)),
);
const label = computed(() => {
  if (closing.value) return 'Закрыть';
  return hasChoice.value ? 'Подтвердить' : okControl.value.label || 'Завершить действие';
});

const click = () => {
  if (closing.value) return dismissBattleResult();
  return onFinishAction();
};
</script>
