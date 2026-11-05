<template>
  <div class="bg-app text-ink relative flex h-full min-h-0 flex-col">
    <main class="relative min-h-0 flex-1 overflow-hidden">
      <GameBoard
        class="absolute inset-0"
        :interactive="props.boardInteractive"
        hp-badges
        map-frame
        table-bg
        :fit-units="64"
        @select-node="onCellClick"
        @select-fighter="onFighterClick"
      />

      <HintsWindow :text="props.hintText" :tone="props.hintTone" />

      <div class="pointer-events-none absolute top-12 left-14 z-30 flex items-center gap-8">
        <NuxtLink
          to="/"
          class="pointer-events-auto inline-flex"
          aria-label="UnPlugged — на главную"
        >
          <BrandLogo class="h-28 w-auto" />
        </NuxtLink>
      </div>

      <div
        class="pointer-events-none absolute inset-x-0 top-88 z-20 flex flex-col items-center gap-8 px-24"
      >
        <ChoicePanel class="pointer-events-auto" />
      </div>

      <TopRail :compact="props.compact" @toggle-view="emit('toggle-view')" />

      <div class="pointer-events-none absolute top-70 right-14 z-20 flex flex-col items-end gap-6">
        <p
          class="text-12 border-line/70 bg-app/80 text-ink rounded-4 backdrop-blur-6 border-2 px-10 py-4 tracking-[0.04em] uppercase lining-nums"
        >
          {{ props.stageLabel }} · {{ props.partyTime }}
        </p>

        <p
          v-if="props.limitVisible"
          class="text-13 rounded-4 pointer-events-auto border-2 px-10 py-4 lining-nums"
          :class="
            props.limitExpired
              ? 'border-danger bg-app/80 text-danger'
              : 'border-line/70 bg-app/80 text-ink'
          "
          role="timer"
          aria-live="off"
        >
          {{ props.limitText }}
        </p>

        <p
          v-for="card in revealedCards"
          :key="`reveal-${card.cardId}`"
          class="text-13 border-violet/50 bg-violet/10 rounded-4 pointer-events-auto max-w-340 border-2 px-10 py-4"
        >
          Раскрыта карта ({{ card.ownerName }}): «{{ card.name }}» · значение {{ card.value }} ·
          бонус {{ card.bonus }}
        </p>
      </div>

      <div class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-24">
        <BattleWindow />
      </div>

      <HeroRail v-if="!props.compact && !anyModalOpen" />

      <HandFan v-if="!props.compact && !anyModalOpen" />

      <div
        v-if="!props.compact && isPlacement && !anyModalOpen"
        class="pointer-events-none absolute right-12 bottom-205 z-20 flex"
      >
        <PlacementTray class="pointer-events-auto" />
      </div>

      <HandWindow />
      <DeckWindow />
      <DiscardWindow />

      <CardDragLayer />

      <CardFlights />

      <HeroDetailsModal />

      <ProfileModal />

      <SettingsModal />

      <ConfirmModal />

      <GameMenu />

      <div
        v-if="showPickNumHero"
        class="bg-app/70 fixed inset-0 z-50 flex items-center justify-center p-24"
      >
        <div class="border-line bg-surface rounded-6 flex max-w-420 flex-col gap-8 border-2 p-16">
          <p class="text-16 font-medium tracking-[0.02em] uppercase">Герой для номерной клетки</p>

          <label
            v-for="hero in myHeroes"
            :key="hero.id"
            class="border-line rounded-4 flex cursor-pointer items-center gap-8 border-2 p-6"
          >
            <input
              v-model="selectedNumHeroId"
              type="radio"
              class="size-14"
              :value="String(hero.id)"
              @change="onPickNumHero(String(hero.id))"
            />
            <div class="text-15">{{ hero.name || hero.id }}</div>
          </label>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import PlacementTray from '~/components/molecules/game/PlacementTray.vue';
import DeckWindow from '~/components/molecules/game/DeckWindow.vue';
import DiscardWindow from '~/components/molecules/game/DiscardWindow.vue';
import HandWindow from '~/components/molecules/game/HandWindow.vue';
import GameBoard from '~/components/organisms/game/Board.vue';
import BattleWindow from '~/components/organisms/game/BattleWindow.vue';
import CardDragLayer from '~/components/organisms/game/CardDragLayer.vue';
import CardFlights from '~/components/organisms/game/CardFlights.vue';
import ChoicePanel from '~/components/organisms/game/ChoicePanel.vue';
import HintsWindow from '~/components/organisms/game/HintsWindow.vue';
import GameMenu from '~/components/organisms/game/GameMenu.vue';
import HandFan from '~/components/organisms/game/HandFan.vue';
import HeroRail from '~/components/organisms/game/HeroRail.vue';
import TopRail from '~/components/organisms/game/TopRail.vue';
import ConfirmModal from '~/components/organisms/modals/ConfirmModal.vue';
import HeroDetailsModal from '~/components/organisms/modals/HeroDetailsModal.vue';
import ProfileModal from '~/components/organisms/modals/ProfileModal.vue';
import SettingsModal from '~/components/organisms/modals/SettingsModal.vue';
import { addActiveModal, isAnyModalOpen, removeActiveModal } from '~/composables/ui/useModal.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import BrandLogo from '~/svg/brand/logo.svg';

const props = defineProps({
  hintText: { type: String, default: '' },
  hintTone: { type: String, default: '' },
  stageLabel: { type: String, default: '' },
  partyTime: { type: String, default: '' },
  limitVisible: { type: Boolean, default: false },
  limitExpired: { type: Boolean, default: false },
  limitText: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  boardInteractive: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle-view']);

const anyModalOpen = isAnyModalOpen();

const {
  isPlacement,
  myHeroes,
  revealedCards,
  showPickNumHero,
  selectedNumHeroId,
  onPickNumHero,
  onFighterClick,
  onCellClick,
} = useGameSession();

watch(
  showPickNumHero,
  open => (open ? addActiveModal('pickNumHero') : removeActiveModal('pickNumHero')),
  { immediate: true },
);

onBeforeUnmount(() => removeActiveModal('pickNumHero'));
</script>
