<template>
  <PileWindow name="hand" :title="title" :close-label="closeLabel">
    <div v-if="cards.length" class="flex flex-wrap gap-12">
      <div
        v-for="card in cards"
        :key="keyOf(card)"
        :data-hand-choice="picking ? keyOf(card) : undefined"
        :class="[
          picking ? 'cursor-pointer' : null,
          pickedOf(card) ? 'rounded-8 ring-accent ring-4' : null,
        ]"
        @click="pick(card)"
      >
        <Card :card="card" mode="window" :disabled="picking ? card.disabled === true : true" />
      </div>
    </div>

    <p v-else class="text-dim text-15">{{ emptyText }}</p>

    <template v-if="picking" #footer>
      <span class="text-16 text-dim mr-auto">{{ status }}</span>

      <AButton data-hand-choice-ok :disabled="!confirmEnabled" @click="onFinishAction()">
        {{ confirmLabel }}
      </AButton>
    </template>
  </PileWindow>
</template>

<script setup>
import AButton from '~/components/atoms/AButton.vue';
import Card from '~/components/molecules/game/Card.vue';
import PileWindow from '~/components/molecules/game/PileWindow.vue';
import { useGameSession } from '~/composables/game/useGameSession.js';
import {
  handChoiceConfirmLabel,
  handChoiceStatus,
  sortHandCards,
} from '~/composables/game/useGameHelpers.js';
import { closeModal, openModal, useModalPayload } from '~/composables/ui/useModal.js';

const {
  players,
  choiceHand,
  choicePicked,
  choiceRequired,
  choiceConfirmEnabled,
  pickChoiceCard,
  onFinishAction,
} = useGameSession();

const payload = useModalPayload('hand');
const autoOpened = ref(false);

const picking = computed(() => choiceHand.value != null);

const playerId = computed(() =>
  String(choiceHand.value?.playerId ?? payload.value?.playerId ?? ''),
);

const player = computed(
  () => (players.value ?? []).find(item => String(item.id) === playerId.value) ?? null,
);

const cards = computed(() =>
  picking.value
    ? choiceHand.value.cards
    : sortHandCards(Array.isArray(player.value?.hand) ? player.value.hand : []),
);

const keyOf = card => String(card?.optionId ?? card?.instanceId ?? card?.id ?? '');
const pickedOf = card => choicePicked.value.includes(String(card?.optionId ?? ''));
const pick = card => (picking.value ? pickChoiceCard(card) : undefined);

const title = computed(() => {
  const hero = [...(player.value?.fighters ?? []), ...(player.value?.lost ?? [])].find(
    fighter => fighter.type === 'hero',
  );
  const name = hero?.name || player.value?.name || choiceHand.value?.name || '';
  return name ? `Рука: ${name}` : 'Рука';
});

const closeLabel = computed(() => (picking.value ? 'Свернуть руку' : 'Закрыть руку'));

const status = computed(() =>
  handChoiceStatus({ picked: choicePicked.value.length, required: choiceRequired.value }),
);

const confirmLabel = computed(() =>
  handChoiceConfirmLabel({ picked: choicePicked.value.length, required: choiceRequired.value }),
);

const confirmEnabled = computed(() => choiceConfirmEnabled.value);

const emptyText = computed(() =>
  picking.value
    ? 'В руке нечего выбрать'
    : 'Эти карты сейчас скрыты от вас — видно только их число',
);

watch(
  () => choiceHand.value?.playerId ?? '',
  id => {
    if (id) {
      autoOpened.value = true;
      openModal('hand', { playerId: id, picking: true });
      return;
    }
    if (autoOpened.value) {
      autoOpened.value = false;
      closeModal('hand');
    }
  },
  { immediate: true },
);
</script>
