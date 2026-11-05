<template>
  <GameScreen
    :hint-text="hintText"
    :hint-tone="gameHint?.tone ?? ''"
    :stage-label="stageLabel"
    :party-time="partyTime"
    :limit-visible="activeLimitSeconds > 0"
    :limit-expired="activeLimitExpired"
    :limit-text="activeLimitExpired ? activeLimitExpiredText : activeLimitText"
    :compact="compact"
    :board-interactive="boardReady"
    @toggle-view="toggleCompact"
  />
</template>

<script setup>
import { HINTS } from '#shared/constants/hints.js';
import GameScreen from '~/components/organisms/game/GameScreen.vue';
import { ensureClock, useClock } from '~/composables/ui/useClock.js';
import { useGameAi } from '~/composables/game/useGameAi.js';
import { useGameHint } from '~/composables/game/useGameHint.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { useGameView } from '~/composables/game/useGameView.js';
import { useSeoTitle } from '~/composables/ui/useSeoTitle';

const route = useRoute();
const { bootstrap, clear } = useGameView();

const compact = ref(false);

const toggleCompact = () => {
  compact.value = !compact.value;
};

const partyFailure = err => {
  const status = Number(err?.statusCode ?? err?.status ?? err?.data?.statusCode ?? 0);
  if (status === 404) {
    return {
      statusCode: 404,
      statusMessage: 'Партия не найдена',
      message:
        'Сервер держит партии в памяти и теряет их при перезапуске: этой партии у него больше нет. Начните новую из лобби.',
    };
  }
  if (!status) {
    return {
      statusCode: 404,
      statusMessage: 'Партия не найдена',
      message:
        'Этой вкладке партия неизвестна — она открыта заново или в другом окне. Начните новую из лобби.',
    };
  }
  return {
    statusCode: status,
    statusMessage: 'Партия не открылась',
    message: err instanceof Error ? err.message : 'Сервер не отдал партию',
  };
};

onUnmounted(() => clear());

if (!route.query.gameId || !route.query.playerId) {
  await navigateTo('/');
} else {
  try {
    await bootstrap(String(route.query.gameId), String(route.query.playerId));
  } catch (err) {
    await showError(partyFailure(err));
  }
}

const {
  view,
  steps,
  actingPlayerId,
  isHumanSeat,
  resignByTimeout,
  isGameOver,
  pending,
  error,
  hint,
  isPlacement,
  boardInteractive,
  clearFighterSelection,
} = useGameSession();

const limitSeconds = setting => Math.max(0, Number(view.value?.settings?.[setting] ?? 0));
const limitLabel = seconds => (seconds >= 60 ? `${Math.round(seconds / 60)} мин` : `${seconds} с`);

const actionLimitSeconds = computed(() => limitSeconds('actionLimit'));
const placementLimitSeconds = computed(() => limitSeconds('placementLimit'));

const playClock = useClock({ key: 'party:play', mode: 'up' });
const placementClock = useClock({
  key: 'party:placement',
  mode: 'down',
  limit: () => placementLimitSeconds.value * 1000,
  onExpire: () => {
    if (isPlacement.value) resignByTimeout(true);
  },
});
const actionClock = useClock({
  mode: 'down',
  limit: () => actionLimitSeconds.value * 1000,
  onExpire: () => resignByTimeout(false),
});

watch(
  isPlacement,
  placement => {
    if (placement) return;
    ensureClock('party:play');
    placementClock.stop();
  },
  { immediate: true },
);

watch(
  () => [steps.value, actingPlayerId.value, isGameOver.value],
  () => {
    if (isGameOver.value || !isHumanSeat(actingPlayerId.value)) {
      actionClock.stop();
      return;
    }
    actionClock.restart();
  },
  { immediate: true },
);

const partyTime = playClock.label;

const activeLimitClock = computed(() => (isPlacement.value ? placementClock : actionClock));
const activeLimitSeconds = computed(() =>
  isPlacement.value ? placementLimitSeconds.value : actionLimitSeconds.value,
);
const activeLimitLabel = computed(() => limitLabel(activeLimitSeconds.value));
const activeLimitExpired = computed(
  () => activeLimitSeconds.value > 0 && activeLimitClock.value.expired.value,
);
const activeLimitText = computed(
  () =>
    `${isPlacement.value ? 'Расстановка' : 'На действие'}: ${activeLimitClock.value.label.value} из ${activeLimitLabel.value}`,
);
const activeLimitExpiredText = computed(() =>
  isPlacement.value
    ? HINTS.client.placementExpired({ limit: activeLimitLabel.value })
    : HINTS.client.timerExpired({ limit: activeLimitLabel.value }),
);

const round = computed(() => Number(view.value?.round) || 1);
const stageLabel = computed(() => (isPlacement.value ? 'Расстановка' : `Раунд ${round.value}`));

useSeoTitle(() => (isPlacement.value ? 'Расстановка' : 'Партия'));

const { aiThinking } = useGameAi();

const boardWaitingForAi = computed(() => aiThinking.value && !isPlacement.value);
const { hint: gameHint } = useGameHint({ error, aiThinking: boardWaitingForAi, hint, pending });

const hintText = computed(() => (compact.value ? '' : (gameHint.value?.text ?? '')));

const boardReady = computed(
  () => !aiThinking.value && (boardInteractive.value || isPlacement.value),
);

const onScreenClick = event => {
  if (event?.target?.closest?.('[data-board]')) return;
  clearFighterSelection();
};

onMounted(() => document.addEventListener('click', onScreenClick));
onBeforeUnmount(() => document.removeEventListener('click', onScreenClick));
</script>
