<template>
  <div class="bg-app text-ink relative flex h-full min-h-0 flex-col">
    <Header :mode="modeTitle" :stage="stageLabel" :elapsed="partyTime" menu compact />

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
        <ChoicePanel class="pointer-events-auto" />
      </div>

      <HintsWindow :text="hintText" :tone="gameHint?.tone" />

      <div class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-24">
        <BattleWindow :focus="boardFocus" />
      </div>

      <div class="pointer-events-none absolute top-12 right-12 z-20 flex flex-col items-end gap-8">
        <ATooltip :text="focusToggleLabel" side="left">
          <AButton
            variant="secondary"
            icon
            class="bg-surface/95 pointer-events-auto"
            :aria-label="focusToggleLabel"
            data-board-focus
            @click="toggleBoardFocus"
          >
            <Icon :name="focusToggleIcon" class="size-20!" aria-hidden="true" />
          </AButton>
        </ATooltip>

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

      <div
        v-if="!anyModalOpen"
        class="pointer-events-none fixed right-0 bottom-0 left-0 z-10 flex items-end gap-12"
      >
        <PlayersPanel
          v-if="!boardFocus"
          class="pointer-events-none"
          wrapper-class="max-h-[calc(100dvh_-_96*var(--spacing))]"
        />

        <CardsPanel v-if="!boardFocus" />

        <div class="pointer-events-none ml-auto flex flex-col items-end gap-8 self-end p-12">
          <PlacementTray />

          <div class="pointer-events-auto flex items-end gap-12">
            <DeckPile v-if="!boardFocus" />

            <DiscardPile v-if="!boardFocus" />

            <FinishButton />
          </div>
        </div>
      </div>

      <DiscardModal />

      <CardDragLayer />

      <CardFlights />

      <HeroDetailsModal />

      <ProfileModal />

      <SettingsModal />

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
import AButton from '~/components/atoms/AButton.vue';
import ATooltip from '~/components/atoms/ATooltip.vue';
import GameBoard from '~/components/organisms/game/Board.vue';
import DeckPile from '~/components/molecules/game/DeckPile.vue';
import DiscardPile from '~/components/molecules/game/DiscardPile.vue';
import FinishButton from '~/components/molecules/game/FinishButton.vue';
import PlacementTray from '~/components/molecules/game/PlacementTray.vue';
import CardsPanel from '~/components/organisms/game/CardsPanel.vue';
import BattleWindow from '~/components/organisms/game/BattleWindow.vue';
import CardDragLayer from '~/components/organisms/game/CardDragLayer.vue';
import CardFlights from '~/components/organisms/game/CardFlights.vue';
import ChoicePanel from '~/components/organisms/game/ChoicePanel.vue';
import PlayersPanel from '~/components/organisms/game/PlayersPanel.vue';
import DiscardModal from '~/components/organisms/modals/DiscardModal.vue';
import HeroDetailsModal from '~/components/organisms/modals/HeroDetailsModal.vue';
import ProfileModal from '~/components/organisms/modals/ProfileModal.vue';
import SettingsModal from '~/components/organisms/modals/SettingsModal.vue';
import ConfirmModal from '~/components/organisms/modals/ConfirmModal.vue';
import GameMenu from '~/components/organisms/game/Menu.vue';
import HintsWindow from '~/components/organisms/game/HintsWindow.vue';
import Header from '~/components/organisms/layout/Header.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { ensureClock, useClock } from '~/composables/ui/useClock.js';
import { addActiveModal, isAnyModalOpen, removeActiveModal } from '~/composables/ui/useModal.js';
import { useGameAi } from '~/composables/game/useGameAi.js';
import { useGameHint } from '~/composables/game/useGameHint.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { useGameView } from '~/composables/game/useGameView.js';
import { useSeoTitle } from '~/composables/ui/useSeoTitle';

const route = useRoute();
const { bootstrap, clear } = useGameView();

const anyModalOpen = isAnyModalOpen();

const boardFocus = ref(false);
const toggleBoardFocus = () => {
  boardFocus.value = !boardFocus.value;
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

const boardWaitingForAi = computed(() => aiThinking.value && !isPlacement.value);
const { hint: gameHint } = useGameHint({ error, aiThinking: boardWaitingForAi, hint, pending });

const focusToggleLabel = computed(() =>
  boardFocus.value ? TOOLTIPS.board.exit() : TOOLTIPS.board.focus(),
);
const focusToggleIcon = computed(() =>
  boardFocus.value ? 'lucide:minimize-2' : 'lucide:maximize-2',
);
const hintText = computed(() => (boardFocus.value ? '' : (gameHint.value?.text ?? '')));

const onScreenClick = event => {
  if (!isPlacement.value) return;
  if (event?.target?.closest?.('[data-board]')) return;
  clearFighterSelection();
};

onMounted(() => document.addEventListener('click', onScreenClick));
onBeforeUnmount(() => document.removeEventListener('click', onScreenClick));
</script>
