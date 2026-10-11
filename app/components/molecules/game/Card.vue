<template>
  <div class="rounded-8 relative h-320 w-230 shrink-0 bg-white p-4">
    <div class="rounded-6 bg-app flex h-full w-full flex-col overflow-hidden">
      <div class="relative h-[48%] w-full shrink-0">
        <div class="bg-surface-2 absolute inset-0 overflow-hidden">
          <APicture v-if="card.art" :src="card.art" :alt="card.title" class="size-full" />
        </div>

        <div
          class="rounded-b-6 absolute top-0 left-0 flex h-70 w-40 flex-col items-center justify-center gap-2 p-4"
          :class="type.plate"
        >
          <Icon
            :name="type.icon"
            class="size-24! shrink-0 text-white"
            :title="type.label"
            aria-hidden="true"
          />

          <span v-if="card.value != null" class="text-24 font-semibold text-white lining-nums">
            {{ card.value }}
          </span>
        </div>

        <span
          class="rounded-2 absolute right-8 -bottom-16 z-10 flex size-26 rotate-45 items-center justify-center border-2 border-black bg-white"
          :title="`Усиление карты: +${card.bonus}`"
        >
          <span class="text-18 text-app -rotate-45 font-semibold lining-nums">
            {{ card.bonus }}
          </span>
        </span>

        <span
          v-if="props.disabled"
          class="absolute bottom-8 left-8 z-30 text-white/80"
          :title="'Карту нельзя разыграть сейчас'"
          aria-hidden="true"
        >
          <Icon name="lucide:lock" class="size-20" />
        </span>
      </div>

      <div class="flex h-[52%] min-h-0 flex-col gap-6 p-8">
        <p class="text-16 leading-1.1 shrink-0 font-semibold tracking-tight text-white uppercase">
          {{ card.title }}
        </p>

        <div class="h-1 w-full shrink-0 bg-white/20" />

        <AScroll class="min-h-0 flex-1">
          <p class="text-15 font-light text-white">{{ card.text }}</p>

          <CardOptions v-if="options.length" :options="options" class="mt-6" />
        </AScroll>

        <div class="flex min-w-0 shrink-0 items-center justify-end gap-4">
          <span class="text-13 min-w-0 truncate text-white" :title="`Владелец карты: ${owner}`">
            {{ owner }}
          </span>
          <div class="h-16 w-1 shrink-0 bg-white/40" />
          <span
            class="text-13 shrink-0 leading-0 text-white/60"
            :title="`Копий в колоде: ${card.quantity}`"
          >
            ×{{ card.quantity }}
          </span>
        </div>
      </div>
    </div>

    <div
      v-if="props.disabled"
      class="rounded-8 bg-app/45 pointer-events-none absolute inset-0 z-20"
      aria-hidden="true"
    />
  </div>
</template>

<script setup>
import APicture from '~/components/atoms/APicture.vue';
import AScroll from '~/components/atoms/AScroll.vue';
import CardOptions from '~/components/molecules/game/CardOptions.vue';
import { useGameSession } from '~/composables/useGameSession.js';
import { cardType } from '~/utils/game/cardTypes.js';

const props = defineProps({
  card: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
});

const { cardFighterLabel } = useGameSession();

const type = computed(() => cardType(props.card.type));
const owner = computed(() => cardFighterLabel(props.card));
const options = computed(() => props.card.options ?? []);
</script>
