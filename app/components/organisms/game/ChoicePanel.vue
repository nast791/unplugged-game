<template>
  <section
    v-if="options.length || hand"
    class="rounded-6 border-accent/60 bg-surface/95 backdrop-blur-16 w-full max-w-720 border-2 px-20 py-14 shadow-2xl"
  >
    <div class="flex items-start gap-14">
      <Icon name="lucide:list-checks" class="text-accent size-22 shrink-0" aria-hidden="true" />

      <div class="flex min-w-0 flex-1 flex-col gap-10">
        <template v-if="options.length">
          <CardOptions
            interactive
            :single="choiceCount <= 1"
            :options="options"
            :picked="picked"
            @select="onChoiceClick"
          />
        </template>

        <div v-if="hand" class="flex items-center justify-between gap-12">
          <span class="text-16 text-dim">{{ handStatus }}</span>

          <AButton data-hand-open @click="openHand">{{ openLabel }}</AButton>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import AButton from '~/components/atoms/AButton.vue';
import CardOptions from '~/components/molecules/game/CardOptions.vue';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { handChoiceStatus } from '~/composables/game/useGameHelpers.js';
import { openModal } from '~/composables/ui/useModal.js';

const { choiceEntries, choiceCount, choicePicked, choiceHand, choiceRequired, onChoiceClick } =
  useGameSession();

const CARD_ZONES = ['hand', 'deck', 'discard'];
const PLACE_NAMES = { hand: 'руки', deck: 'колоды', discard: 'сброса' };
const PLACE_LABELS = { hand: 'руку', deck: 'колоду', discard: 'сброс' };

// карты (рука, колода, сброс) идут окном с настоящими картами: строкой их не подписываем
const options = computed(() =>
  choiceEntries.value
    .filter(entry => !CARD_ZONES.includes(String(entry.zone ?? '')))
    .map(entry => ({
      id: String(entry.optionId),
      text: entry.title ?? String(entry.optionId),
      disabled: entry.disabled === true,
    })),
);
const picked = choicePicked;
const hand = choiceHand;
const zone = computed(() => String(hand.value?.zone ?? 'hand'));
const openLabel = computed(() => `Открыть ${PLACE_LABELS[zone.value] ?? 'руку'}`);

const handStatus = computed(() =>
  handChoiceStatus({
    picked: picked.value.length,
    required: choiceRequired.value,
    place: PLACE_NAMES[zone.value] ?? 'руки',
  }),
);

const openHand = () => {
  const value = hand.value;
  if (!value) return undefined;
  return openModal('hand', { playerId: value.playerId, picking: true });
};
</script>
