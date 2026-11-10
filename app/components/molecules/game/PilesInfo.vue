<template>
  <section
    class="bg-surface/95 border-line rounded-6 backdrop-blur-16 pointer-events-auto absolute bottom-full left-0 z-30 mb-46 flex w-340 flex-col border-2 shadow-2xl"
  >
    <div class="flex">
      <span :class="[TAB_LABEL, 'text-ink border-line/70']">Карты</span>
    </div>

    <div class="flex flex-col gap-8 p-12">
      <div
        v-for="row in rows"
        :key="row.key"
        class="flex items-center justify-between gap-8"
        :data-pile-row="row.key"
        :data-pile-disabled="String(row.disabled)"
      >
        <div class="flex min-w-0 items-center gap-6">
          <Icon :name="row.icon" class="text-dim size-16 shrink-0" aria-hidden="true" />

          <span class="text-14 text-dim truncate">{{ row.title }}</span>
        </div>

        <div class="flex shrink-0 items-center gap-8">
          <span class="text-17 font-semibold lining-nums" :class="row.count > 0 ? '' : 'text-dim'">
            {{ row.count }}
          </span>

          <AButton
            variant="secondary"
            class="text-13 px-8 py-4"
            :aria-label="row.action"
            :disabled="row.disabled"
            @click="emit('open', row.key)"
          >
            Открыть
          </AButton>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import AButton from '~/components/atoms/AButton.vue';
import { TAB_LABEL } from '~/ui/tabs.js';

const props = defineProps({
  player: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['open']);

const countOf = zone => Number(props.player?.[`${zone}Count`] ?? props.player?.[zone]?.length ?? 0);

const rows = computed(() => {
  const hand = countOf('hand');
  const deck = countOf('deck');
  const discard = countOf('discard');

  return [
    {
      key: 'hand',
      icon: 'lucide:hand',
      title: 'Рука',
      action: 'Открыть руку',
      count: hand,
      disabled: !(props.player?.hand?.length ?? 0),
    },
    {
      key: 'deck',
      icon: 'lucide:layers',
      title: 'Колода',
      action: 'Открыть колоду',
      count: deck,
      disabled: !(props.player?.deckVisible ?? false),
    },
    {
      key: 'discard',
      icon: 'lucide:trash-2',
      title: 'Сброс',
      action: 'Открыть сброс',
      count: discard,
      disabled: discard <= 0,
    },
  ];
});
</script>
