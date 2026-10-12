<template>
  <div class="bg-app text-ink relative flex h-full min-h-0 flex-col">
    <Header :mode="modeTitle" :stage="stageLabel" :elapsed="partyTime" menu />

    <main class="relative min-h-0 flex-1 overflow-hidden">
      <GameBoard
        class="absolute inset-0"
        :interactive="!aiThinking && (boardInteractive || isPlacement)"
        @select-node="onCellClick"
        @select-fighter="onFighterClick"
      />

      <div
        class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-8 px-24 pt-12"
      >
        <HintsWindow :text="gameHint?.text ?? ''" :tone="gameHint?.tone" />

        <ChoicePanel class="pointer-events-auto" />
      </div>

      <div class="pointer-events-none absolute top-12 right-12 z-20 flex flex-col items-end gap-8">
        <p
          v-if="activeLimitSeconds"
          class="text-16 rounded-6 pointer-events-auto flex flex-wrap items-center gap-3 border-2 px-16 py-10"
          :class="
            activeLimitExpired
              ? 'border-danger bg-danger/10 text-danger'
              : 'border-line bg-surface/95'
          "
          role="timer"
          aria-live="off"
        >
          {{ activeLimitExpired ? activeLimitExpiredText : activeLimitText }}
        </p>

        <p
          v-for="card in revealedCards"
          :key="`reveal-${card.cardId}`"
          class="text-16 border-violet/50 bg-violet/10 rounded-6 pointer-events-auto border-2 px-16 py-10"
        >
          Раскрыта карта ({{ card.ownerName }}): «{{ card.name }}» · значение {{ card.value }} ·
          бонус {{ card.bonus }} — её видят все игроки
        </p>
      </div>

      <div v-if="!anyModalOpen" class="fixed right-0 bottom-0 left-0 z-10 flex items-end gap-12">
        <PlayersPanel class="max-h-[calc(100dvh_-_96*var(--spacing))]" />

        <CardsPanel />

        <div class="flex flex-col items-end gap-8 p-12">
          <PlacementTray />

          <div class="flex items-end gap-12">
            <DeckPile />

            <DiscardPile />

            <FinishButton />
          </div>
        </div>
      </div>

      <DiscardModal />

      <HeroSheet />

      <ProfileModal />

      <ConfirmModal />

      <GameMenu />

      <div
        v-if="showPickNumHero"
        class="bg-app/70 fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="border-line bg-surface flex max-w-md flex-col gap-4 border-2 p-6 shadow-2xl">
          <p class="text-18 font-medium tracking-[0.02em] uppercase">Герой для номерной клетки</p>
          <label
            v-for="hero in myHeroes"
            :key="hero.id"
            class="border-line flex cursor-pointer items-center gap-3 border-2 p-3"
          >
            <input
              v-model="selectedNumHeroId"
              type="radio"
              class="size-4"
              :value="String(hero.id)"
              @change="onPickNumHero(String(hero.id))"
            />
            <span>{{ hero.name || hero.id }}</span>
          </label>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { HINTS } from '#shared/constants/hints.js';
import { modes } from '#shared/constants/modes.js';
import GameBoard from '~/components/organisms/game/Board.vue';
import DeckPile from '~/components/molecules/game/DeckPile.vue';
import DiscardPile from '~/components/molecules/game/DiscardPile.vue';
import FinishButton from '~/components/molecules/game/FinishButton.vue';
import PlacementTray from '~/components/molecules/game/PlacementTray.vue';
import CardsPanel from '~/components/organisms/game/CardsPanel.vue';
import ChoicePanel from '~/components/organisms/game/ChoicePanel.vue';
import PlayersPanel from '~/components/organisms/game/PlayersPanel.vue';
import DiscardModal from '~/components/organisms/modals/DiscardModal.vue';
import HeroSheet from '~/components/organisms/modals/HeroSheet.vue';
import ProfileModal from '~/components/organisms/modals/ProfileModal.vue';
import ConfirmModal from '~/components/organisms/modals/ConfirmModal.vue';
import GameMenu from '~/components/organisms/game/Menu.vue';
import HintsWindow from '~/components/organisms/game/HintsWindow.vue';
import Header from '~/components/organisms/layout/Header.vue';
import { ensureClock, useClock } from '~/composables/useClock.js';
import { addActiveModal, isAnyModalOpen, removeActiveModal } from '~/composables/ui/useModal.js';
import { useGameHint } from '~/composables/useGameHint.js';
import { useSeoTitle } from '~/composables/useSeoTitle';

const route = useRoute();
const { bootstrap, clear } = useGameView();

const anyModalOpen = isAnyModalOpen();

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
  gameId,
  steps,
  actingPlayerId,
  isHumanSeat,
  resignByTimeout,
  isGameOver,
  pending,
  error,
  hint,
  isPlacement,
  myHeroes,
  revealedCards,
  boardInteractive,
  showPickNumHero,
  selectedNumHeroId,
  onPickNumHero,
  onFighterClick,
  onCellClick,
  clearFighterSelection,
} = useGameSession();

watch(
  showPickNumHero,
  open => (open ? addActiveModal('pickNumHero') : removeActiveModal('pickNumHero')),
  { immediate: true },
);

onBeforeUnmount(() => removeActiveModal('pickNumHero'));

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

const modeTitle = computed(() => {
  const name = view.value?.settings?.mode;
  if (!name) return '';
  return modes.find(mode => mode.name === name)?.title ?? String(name);
});
const round = computed(() => Number(view.value?.round) || 1);

const stageLabel = computed(() => (isPlacement.value ? 'Расстановка' : `Раунд ${round.value}`));

useSeoTitle(() => modeTitle.value || 'Партия');

const { aiThinking } = useGameAi();

/**
 * «Компьютер думает» показываем только тогда, когда он думает **за себя в игре**: свою расстановку он
 * ведёт параллельно с человеком, и подсказка движка про расстановку в этот момент адресована человеку.
 */
const boardWaitingForAi = computed(() => aiThinking.value && !isPlacement.value);
const { hint: gameHint } = useGameHint({ error, aiThinking: boardWaitingForAi, hint, pending });

const onScreenClick = event => {
  if (!isPlacement.value) return;
  if (event?.target?.closest?.('[data-board]')) return;
  clearFighterSelection();
};

onMounted(() => document.addEventListener('click', onScreenClick));
onBeforeUnmount(() => document.removeEventListener('click', onScreenClick));
</script>
