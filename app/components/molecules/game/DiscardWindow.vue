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

            <span
              v-if="stack.cards.length > 1"
              class="text-12 text-dim absolute right-0 lining-nums"
              data-card-stack-count
            >
              ×{{ stack.cards.length }}
            </span>
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
import { CARD_TYPE_ORDER, cardType } from '~/constants/cards.js';
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

const byType = () => {
  const groups = new Map(CARD_TYPE_ORDER.map(type => [type, new Map()]));

  for (const card of cards.value) {
    const stacks = groups.get(String(card.type));
    if (!stacks) continue;
    const id = String(card.id);
    if (!stacks.has(id)) stacks.set(id, []);
    stacks.get(id).push(card);
  }

  return [...groups.entries()]
    .map(([type, stacks]) => {
      const list = [...stacks.entries()].map(([id, cards]) => ({ id, cards }));
      return {
        type,
        label: cardType(type).label,
        count: list.reduce((sum, stack) => sum + stack.cards.length, 0),
        stacks: list,
      };
    })
    .filter(group => group.stacks.length);
};

const groups = computed(byType);
const tabLabel = group => `${group.label} · ${group.count}`;
const tabs = computed(() =>
  groups.value.map(group => ({ id: group.type, label: tabLabel(group) })),
);
const activeType = ref('');

/** Стопка дублей: верхняя карта лежит как одиночная, каждая следующая — ниже на один шаг. */
const STACK_STEP = 16;
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
