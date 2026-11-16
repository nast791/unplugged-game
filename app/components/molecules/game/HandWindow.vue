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

      <AButton data-hand-choice-ok :disabled="!confirmEnabled" @click="onConfirm()">
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
  you,
  combat,
  targeting,
  choiceHand,
  choicePicked,
  choiceRequired,
  choiceConfirmEnabled,
  pickChoiceCard,
  onFinishAction,
} = useGameSession();

const payload = useModalPayload('hand');
const autoOpened = ref(false);
// мгновенный выбор в паузе боя (карта сразу уходит в сброс) сначала отмечается рамкой, применяет «Подтвердить»
const staged = ref(null);

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

const stagedKey = computed(() => (staged.value ? keyOf(staged.value) : ''));

const pickedOf = card =>
  choicePicked.value.includes(String(card?.optionId ?? '')) || stagedKey.value === keyOf(card);

const pick = card => {
  if (!picking.value) return;
  // выбор из руки всегда подтверждают кнопкой: клик только обводит карту рамкой
  staged.value = stagedKey.value === keyOf(card) ? null : card;
};

const marked = computed(() => {
  const extra = staged.value && !choicePicked.value.includes(stagedKey.value) ? 1 : 0;
  return choicePicked.value.length + extra;
});

const nameOf = id => {
  const entry = (players.value ?? []).find(item => String(item.id) === String(id));
  const hero = [...(entry?.fighters ?? []), ...(entry?.lost ?? [])].find(
    fighter => fighter.type === 'hero',
  );
  return hero?.name || entry?.name || '';
};

const chooserId = computed(
  () => combat.value?.choice?.playerId ?? targeting.value?.playerId ?? you.value,
);

const who = computed(() => {
  const name = nameOf(chooserId.value);
  return name && String(chooserId.value) === String(you.value) ? 'Вы' : name || 'Игрок';
});

const reason = computed(() => {
  const effect = combat.value?.choice?.effect;
  if (effect === 'bonus') return 'её бонус добавится к вашей карте боя';
  if (effect === 'discard') return 'она уйдёт в сброс';
  // окно по чужой руке (обзор, «Клёв в темноте»): карта уходит из руки противника
  if (String(choiceHand.value?.playerId ?? '') !== String(you.value ?? '')) {
    return 'это рука противника: карта уйдёт в сброс';
  }
  return '';
});

const title = computed(() => {
  const hero = [...(player.value?.fighters ?? []), ...(player.value?.lost ?? [])].find(
    fighter => fighter.type === 'hero',
  );
  const name = hero?.name || player.value?.name || choiceHand.value?.name || '';
  return name ? `Рука: ${name}` : 'Рука';
});

const closeLabel = computed(() => (picking.value ? 'Свернуть руку' : 'Закрыть руку'));

const status = computed(() =>
  handChoiceStatus({
    picked: marked.value,
    required: choiceRequired.value,
    who: who.value,
    reason: reason.value,
  }),
);

const confirmLabel = computed(() =>
  handChoiceConfirmLabel({ picked: marked.value, required: choiceRequired.value }),
);

const confirmEnabled = computed(() => staged.value != null || choiceConfirmEnabled.value);

const onConfirm = () => {
  const card = staged.value;
  if (!card) {
    onFinishAction();
    return;
  }
  staged.value = null;
  pickChoiceCard(card);
};

const emptyText = computed(() =>
  picking.value
    ? 'В руке нечего выбрать'
    : 'Эти карты сейчас скрыты от вас — видно только их число',
);

watch(
  () => [choiceHand.value?.playerId ?? '', combat.value?.choice?.source ?? ''],
  ([id]) => {
    staged.value = null;
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
