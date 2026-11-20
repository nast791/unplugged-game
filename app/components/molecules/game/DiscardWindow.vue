<template>
  <PileWindow name="discard" :title="title" close-label="Закрыть сброс">
    <p v-if="!groups.length" class="text-dim text-15">Сброс пуст</p>

    <ATabs v-else v-model="activeType" :items="tabs">
      <template v-for="group in groups" :key="group.type" #[group.type]>
        <div class="flex flex-wrap items-start gap-12">
          <div
            v-for="stack in group.stacks"
            :key="stack.id"
            class="relative"
            :data-card-stack="stack.cards.length"
            :style="stackStyle(stack.cards.length)"
          >
            <Card
              v-for="(card, index) in stack.cards"
              :key="card.instanceId"
              :card="card"
              mode="window"
              class="absolute top-0 left-0"
              :data-card-stack-layer="index"
              :style="{ zIndex: index + 1, transform: stackShift(index) }"
            />
          </div>
        </div>
      </template>
    </ATabs>
  </PileWindow>
</template>

<script setup>
import ATabs from '~/components/atoms/ATabs.vue';
import Card from '~/components/molecules/game/Card.vue';
import PileWindow from '~/components/molecules/game/PileWindow.vue';
import { cardType } from '~/constants/cards.js';
import { discardStacks } from '~/composables/game/useGameHelpers.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { useModalPayload } from '~/composables/ui/useModal.js';

const { players } = useGameSession();

const payload = useModalPayload('discard');
const target = computed(
  () =>
    (players.value ?? []).find(item => String(item.id) === String(payload.value?.playerId ?? '')) ??
    null,
);
const cards = computed(() => target.value?.discard ?? []);
const title = computed(() => {
  const owner = target.value?.name || target.value?.heroId;
  return owner ? `Сброс: ${owner}` : 'Сброс';
});

const groups = computed(() =>
  discardStacks(cards.value).map(group => ({
    type: group.type,
    label: cardType(group.type).label,
    count: group.stacks.reduce((sum, stack) => sum + stack.cards.length, 0),
    stacks: group.stacks,
  })),
);
const tabLabel = group => `${group.label} · ${group.count}`;
const tabs = computed(() =>
  groups.value.map(group => ({ id: group.type, label: tabLabel(group) })),
);
const activeType = ref('');

/**
 * Стопка дублей: верхняя карта лежит как одиночная, каждая следующая — ниже на один шаг.
 * Шаг маленький: у нижней карты видна рамка и полоска фона, то есть понятно, что копия есть.
 */
const STACK_STEP = 10;
const CARD_WIDTH = 200;
const CARD_HEIGHT = 295;
const stackShift = index => `translateY(${index * STACK_STEP}px)`;
const stackStyle = count => ({
  width: `${CARD_WIDTH}px`,
  height: `${CARD_HEIGHT + Math.max(0, count - 1) * STACK_STEP}px`,
});

watch(
  groups,
  list => {
    if (list.some(group => group.type === activeType.value)) return;
    activeType.value = list[0]?.type ?? '';
  },
  { immediate: true },
);
</script>
