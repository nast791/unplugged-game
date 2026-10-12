<template>
  <AModal name="discard" title="Сброс" :ui="{ modal_content: 'w-[92dvw] max-w-[92dvw]' }">
    <p v-if="!groups.length" class="text-16 text-dim">Сброс пуст</p>

    <section v-for="group in groups" :key="group.type" class="flex flex-col gap-12">
      <h3 class="text-18 font-semibold">
        {{ group.label }}
        <span class="text-dim font-normal">· {{ group.count }}</span>
      </h3>

      <div class="flex flex-wrap items-start gap-24">
        <div v-for="stack in group.stacks" :key="stack.id" class="flex items-start">
          <Card
            v-for="(card, index) in stack.cards"
            :key="card.instanceId"
            :card="card"
            class="relative"
            :class="index ? '-mt-6 -ml-224' : ''"
          />
        </div>
      </div>
    </section>
  </AModal>
</template>

<script setup>
import AModal from '~/components/atoms/AModal.vue';
import Card from '~/components/molecules/game/Card.vue';
import { useGameSession } from '~/composables/useGameSession.js';
import { CARD_TYPE_ORDER, cardType } from '~/composables/useGameHelpers.js';

const { myDiscard } = useGameSession();

const byType = () => {
  const groups = new Map(CARD_TYPE_ORDER.map(type => [type, new Map()]));

  for (const card of myDiscard.value) {
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
</script>
