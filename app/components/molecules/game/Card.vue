<template>
  <div class="rounded-8 relative h-295 w-200 shrink-0 bg-white p-4" :data-card-mode="props.mode">
    <div class="rounded-6 bg-app flex h-full w-full flex-col overflow-hidden">
      <div
        class="relative w-full shrink-0 transition-[height] duration-300 ease-out"
        :class="hiddenArt ? 'h-0' : 'h-[48%]'"
        data-card-art
      >
        <div class="bg-surface-2 absolute inset-0 overflow-hidden">
          <APicture v-if="card.art" :src="card.art" :alt="card.title" class="size-full" />
        </div>

        <div
          v-if="!hiddenArt"
          class="rounded-b-6 absolute top-0 left-0 flex w-38 flex-col items-center gap-2 p-4"
          :class="type.plate"
          data-card-plate
        >
          <div class="flex h-54 w-full shrink-0 flex-col items-center justify-center gap-2">
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

          <ATooltip v-for="mark in tagMarks" :key="mark.tag" :text="mark.tooltip()">
            <span class="text-white" :data-card-tag="mark.tag" aria-hidden="true">
              <Icon :name="mark.icon" class="size-22!" />
            </span>
          </ATooltip>
        </div>

        <ATooltip
          v-if="card.bonus && !hiddenArt"
          :text="TOOLTIPS.card.bonus({ bonus: card.bonus })"
        >
          <span
            class="rounded-2 absolute right-8 -bottom-14 z-10 flex size-24 rotate-45 items-center justify-center border-2 border-black bg-white"
          >
            <span class="text-16 text-app -rotate-45 font-semibold lining-nums">
              {{ card.bonus }}
            </span>
          </span>
        </ATooltip>

        <ATooltip v-if="props.disabled && !hiddenArt" :text="TOOLTIPS.card.locked()">
          <span class="absolute bottom-8 left-8 z-30 text-white/80" aria-hidden="true">
            <Icon name="lucide:lock" class="size-18!" />
          </span>
        </ATooltip>

        <ATooltip v-else-if="props.boost && !hiddenArt" :text="TOOLTIPS.card.boost()">
          <span class="absolute bottom-8 left-8 z-30 text-white/80" aria-hidden="true">
            <component :is="MoveIcon" class="size-18!" />
          </span>
        </ATooltip>
      </div>

      <div
        class="flex min-h-0 flex-1 flex-col gap-6 px-8 pb-8 transition-[padding-top] duration-300 ease-out"
        :class="hiddenArt ? 'pt-36' : 'pt-8'"
      >
        <p
          class="leading-1.1 shrink-0 font-semibold tracking-tight text-white uppercase"
          :class="[titleInset, props.mode === 'detail' ? 'text-13' : 'text-15']"
        >
          {{ card.title }}
        </p>

        <div class="h-1 w-full shrink-0 bg-white/20" />

        <AScroll class="-mr-8 min-h-0 flex-1" :ui="{ scroll_viewport: 'pr-8' }">
          <CardText
            :text="card.text"
            :highlight="props.highlight"
            :tone="props.mode === 'detail' ? 'detail' : 'card'"
          />

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

    <Transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0">
      <div
        v-if="hiddenArt"
        class="absolute top-8 left-12 z-30 flex h-26 items-center gap-12"
        data-card-detail-value
      >
        <div class="flex items-center gap-4">
          <span class="size-12 shrink-0 rounded-full" :class="type.plate" data-card-type-dot />

          <span
            v-if="shownValue != null"
            class="text-16 font-semibold lining-nums"
            :class="valueChanged ? 'text-gold' : 'text-white'"
          >
            {{ shownValue }}
          </span>
        </div>

        <div
          class="flex items-center gap-4"
          v-if="tagMarks.length || props.disabled || props.boost"
        >
          <ATooltip v-for="mark in tagMarks" :key="mark.tag" :text="mark.tooltip()">
            <span class="text-white" :data-card-tag="mark.tag" aria-hidden="true">
              <Icon :name="mark.icon" class="size-14!" />
            </span>
          </ATooltip>

          <ATooltip v-if="props.disabled" :text="TOOLTIPS.card.locked()">
            <span class="text-white/80" data-card-disabled aria-hidden="true">
              <Icon name="lucide:lock" class="size-14!" />
            </span>
          </ATooltip>

          <ATooltip v-else-if="props.boost" :text="TOOLTIPS.card.boost()">
            <span class="text-white/80" data-card-boost aria-hidden="true">
              <component :is="MoveIcon" class="size-14!" />
            </span>
          </ATooltip>
        </div>
      </div>
    </Transition>

    <ATooltip v-if="props.mode !== 'hand'" :text="eyeTooltip">
      <button
        type="button"
        data-card-eye
        class="bg-app/70 hover:bg-app absolute top-8 right-8 z-30 flex size-26 cursor-pointer items-center justify-center rounded-full text-white"
        :aria-pressed="hiddenArt"
        @click.stop="toggleArt"
      >
        <Icon
          :name="hiddenArt ? 'lucide:eye-off' : 'lucide:eye'"
          class="size-16!"
          aria-hidden="true"
        />
      </button>
    </ATooltip>

    <div
      v-if="props.disabled && props.mode !== 'detail'"
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
import CardText from '~/components/molecules/game/CardText.vue';
import MoveIcon from '~/svg/game/move.svg';
import { cardTagMarks, cardType } from '~/constants/cards.js';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { useGameSession } from '~/composables/game/useGameSession.js';

const props = defineProps({
  card: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  boost: { type: Boolean, default: false },

  highlight: { type: Array, default: () => [] },

  value: { type: Number, default: null },
  valueChanged: { type: Boolean, default: false },

  mode: { type: String, default: 'hand' },
});

const { cardFighterLabel } = useGameSession();

const type = computed(() => cardType(props.card.type));
const tagMarks = computed(() => cardTagMarks(props.card.tags));
const hiddenArt = ref(false);
const eyeTooltip = computed(() => (hiddenArt.value ? TOOLTIPS.card.eyeOff() : TOOLTIPS.card.eye()));

const titleInset = computed(() => (props.card.bonus || props.mode !== 'hand' ? 'pr-32' : null));

const toggleArt = () => {
  hiddenArt.value = !hiddenArt.value;
};

const capitalize = text => (text ? text[0].toUpperCase() + text.slice(1) : text);

const ownerLabel = computed(() => capitalize(cardFighterLabel(props.card)));
const options = computed(() => props.card.options ?? []);
const shownValue = computed(() =>
  props.value == null ? (props.card.value ?? null) : Number(props.value),
);
</script>
