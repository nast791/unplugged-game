<template>
  <div class="rounded-8 relative h-295 w-200 shrink-0 bg-white p-4">
    <div class="rounded-6 bg-app flex h-full w-full flex-col overflow-hidden">
      <div class="relative h-[48%] w-full shrink-0">
        <div class="bg-surface-2 absolute inset-0 overflow-hidden">
          <APicture v-if="card.art" :src="card.art" :alt="card.title" class="size-full" />
        </div>

        <div
          class="rounded-b-6 absolute top-0 left-0 flex h-62 w-38 flex-col items-center justify-center gap-2 p-4"
          :class="type.plate"
        >
          <ATooltip :text="TOOLTIPS.card.type({ label: type.label })">
            <Icon
              v-if="type.icon"
              :name="type.icon"
              class="size-22! shrink-0 text-white"
              aria-hidden="true"
            /><span v-else data-icon-missing :data-card="JSON.stringify(card.type)"></span>
          </ATooltip>

          <span
            v-if="shownValue != null"
            class="text-22 font-semibold lining-nums"
            :class="valueChanged ? 'text-gold' : 'text-white'"
          >
            {{ shownValue }}
          </span>
        </div>

        <ATooltip v-if="card.bonus" :text="TOOLTIPS.card.bonus({ bonus: card.bonus })">
          <span
            class="rounded-2 absolute right-8 -bottom-14 z-10 flex size-24 rotate-45 items-center justify-center border-2 border-black bg-white"
          >
            <span class="text-16 text-app -rotate-45 font-semibold lining-nums">
              {{ card.bonus }}
            </span>
          </span>
        </ATooltip>

        <ATooltip v-if="props.disabled" :text="TOOLTIPS.card.locked()">
          <span class="absolute bottom-8 left-8 z-30 text-white/80" aria-hidden="true">
            <Icon name="lucide:lock" class="size-18!" />
          </span>
        </ATooltip>
      </div>

      <div class="flex h-[52%] min-h-0 flex-col gap-6 p-8">
        <p
          class="text-15 leading-1.1 shrink-0 font-semibold tracking-tight text-white uppercase"
          :class="titleInset"
        >
          {{ card.title }}
        </p>

        <div class="h-1 w-full shrink-0 bg-white/20" />

        <AScroll class="min-h-0 flex-1">
          <p class="text-14 font-light text-white">
            <span
              v-for="part in textParts"
              :key="part.key"
              class="block"
              :class="part.active && 'text-accent font-semibold'"
            >
              {{ part.text }}
            </span>
          </p>

          <CardOptions v-if="options.length" :options="options" class="mt-6" />
        </AScroll>

        <div class="flex min-w-0 items-center justify-end gap-4 leading-none">
          <ATooltip :text="TOOLTIPS.card.fighter({ name: ownerLabel })">
            <span class="text-13 min-w-0 truncate text-white">{{ ownerLabel }}</span>
          </ATooltip>
          <div class="h-13 w-1 min-w-0 bg-white/40" />
          <ATooltip
            v-if="card.quantity != null"
            :text="TOOLTIPS.card.copies({ count: card.quantity })"
          >
            <span class="text-13 min-w-0 text-white/60">×{{ card.quantity }}</span>
          </ATooltip>
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
import ATooltip from '~/components/atoms/ATooltip.vue';
import CardOptions from '~/components/molecules/game/CardOptions.vue';
import { cardType } from '~/constants/cards.js';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { cardTextParts } from '~/composables/game/useGameHelpers.js';

const props = defineProps({
  card: { type: Object, required: true },
  disabled: { type: Boolean, default: false },

  highlight: { type: Array, default: () => [] },

  value: { type: Number, default: null },
  valueChanged: { type: Boolean, default: false },
});

const { cardFighterLabel } = useGameSession();

const type = computed(() => cardType(props.card.type));
const titleInset = computed(() => (props.card.bonus ? 'pr-32' : null));

const ownerLabel = computed(() => cardFighterLabel(props.card));
const options = computed(() => props.card.options ?? []);
const shownValue = computed(() =>
  props.value == null ? (props.card.value ?? null) : Number(props.value),
);
const textParts = computed(() =>
  cardTextParts(props.card.text).map((part, index) => ({
    ...part,
    key: `${index}-${part.moment ?? 'text'}`,
    active: part.moment != null && props.highlight.includes(part.moment),
  })),
);
</script>
