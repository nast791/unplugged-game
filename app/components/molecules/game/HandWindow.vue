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

// кто выбирает — всегда имя героя: «Вы» в подсказке не говорит, чья это рука и чей выбор
const who = computed(() => nameOf(chooserId.value) || 'Игрок');

const ZONE_TITLES = { hand: 'Рука', deck: 'Колода', discard: 'Сброс' };
const PLACE_NAMES = { hand: 'руки', deck: 'колоды', discard: 'сброса' };

const zone = computed(() => String(choiceHand.value?.zone ?? 'hand'));

const reason = computed(() => {
  const effect = combat.value?.choice?.effect;
  const own = String(chooserId.value) === String(you.value ?? '');
  if (effect === 'bonus') {
    return own ? 'её бонус добавится к вашей карте боя' : 'её бонус добавится к его карте боя';
  }
  if (effect === 'discard') return 'она уйдёт в сброс';
  // выбор карты не из руки: карта колоды или сброса — выбранная возвращается в руку владельцу
  if (picking.value && zone.value === 'deck') return 'это карта колоды: выбранная уйдёт в руку';
  if (picking.value && zone.value === 'discard') {
    return 'это карта сброса: выбранная вернётся в руку';
  }
  // окно по чужой руке (обзор, «Клёв в темноте»): карта уходит из руки противника
  if (String(choiceHand.value?.playerId ?? '') !== String(you.value ?? '')) {
    return 'это рука противника: карта уйдёт в сброс';
  }
  return '';
});

const title = computed(() => {
  const label = ZONE_TITLES[zone.value] ?? 'Рука';
  const hero = [...(player.value?.fighters ?? []), ...(player.value?.lost ?? [])].find(
    fighter => fighter.type === 'hero',
  );
  const name = hero?.name || player.value?.name || choiceHand.value?.name || '';
  return name ? `${label}: ${name}` : label;
});

const closeLabel = computed(() => (picking.value ? 'Свернуть окно' : 'Закрыть руку'));

const status = computed(() =>
  handChoiceStatus({
    picked: marked.value,
    required: choiceRequired.value,
    who: who.value,
    reason: reason.value,
    place: PLACE_NAMES[zone.value] ?? 'руки',
  }),
);

const confirmLabel = computed(() =>
  handChoiceConfirmLabel({ picked: marked.value, required: choiceRequired.value }),
);

const confirmEnabled = computed(() => staged.value != null || choiceConfirmEnabled.value);

const onConfirm = async () => {
  const card = staged.value;
  if (!card) {
    onFinishAction();
    return;
  }
  staged.value = null;
  // пауза боя применяет карту сразу (движок сам сбрасывает её), окно вариантов — отметкой и «Подтвердить»
  if (combat.value?.choice) {
    pickChoiceCard(card);
    return;
  }
  await pickChoiceCard(card);
  // окно вариантов ещё открыто — подтверждаем его тем же нажатием; если движок применил выбор сам, не шлём лишнего
  if (targeting.value) await onFinishAction();
};

const emptyText = computed(() =>
  picking.value
    ? `В ${(ZONE_TITLES[zone.value] ?? 'руке').toLowerCase()} нечего выбрать`
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
