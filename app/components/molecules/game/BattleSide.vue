<template>
  <article data-battle-side :data-side="side.side" class="flex w-200 shrink-0 flex-col gap-8">
    <div class="flex items-center gap-8">
      <AAvatar
        :alt="side.fighterName"
        :style="side.color ? { '--hero-color': side.color } : null"
        :ui="{ avatar_root: 'size-44 border-3 border-[var(--hero-color)]' }"
      />

      <div class="flex min-w-0 flex-col">
        <span class="text-15 min-w-0 truncate font-semibold">{{ side.fighterName }}</span>
        <span class="text-13 text-dim min-w-0 truncate">{{ side.playerName }}</span>
      </div>

      <span
        v-if="side.hpLabel"
        class="text-15 ml-auto shrink-0 font-semibold lining-nums"
        :style="{ color: side.hpColor }"
      >
        {{ side.hpLabel }}
      </span>
    </div>

    <div class="relative" data-battle-slot>
      <Card
        v-if="side.card"
        :class="boost && boostFront ? 'z-10' : 'z-30'"
        :card="side.card"
        :highlight="highlight"
        :value="side.value"
        :value-changed="side.valueChanged"
      />

      <div
        v-else
        class="rounded-8 flex h-295 w-200 items-center justify-center border-2 border-dashed px-12 text-center"
        :class="waiting ? 'border-info/60 text-info' : 'border-line text-dim'"
      >
        <span class="text-15">{{ slotLabel }}</span>
      </div>

      <div
        v-if="boost"
        data-battle-boost
        class="absolute top-24 left-0 cursor-pointer"
        :class="boostFront ? 'z-40' : 'z-20'"
        @click.stop="boostFront = !boostFront"
      >
        <Card :card="boost" :highlight="highlight" />
      </div>

      <span
        v-if="damageAmount"
        data-battle-damage
        class="battle-damage rounded-4 bg-danger text-app text-18 absolute -top-10 left-1/2 px-10 py-4 font-bold lining-nums"
      >
        −{{ damageAmount }}
      </span>
    </div>

    <span
      v-if="side.valueChanged"
      data-battle-value
      class="text-14 text-center font-semibold"
      :class="side.valueDelta > 0 ? 'text-success' : 'text-danger'"
    >
      значение карты {{ side.valueDelta > 0 ? '+' : '' }}{{ side.valueDelta }}
    </span>
  </article>
</template>

<script setup>
import AAvatar from '~/components/atoms/AAvatar.vue';
import Card from '~/components/molecules/game/Card.vue';

const props = defineProps({
  side: { type: Object, required: true },

  highlight: { type: Array, default: () => [] },

  boost: { type: Object, default: null },

  damage: { type: Number, default: 0 },
});

const boostFront = ref(false);
const damageAmount = computed(() => Number(props.damage) || 0);
const waiting = computed(() => props.side.cardState === 'waiting');

const SLOTS = {
  waiting: 'Ждём карту защиты',
  empty: 'Без защиты',
  hidden: 'Карта закрыта',
};

const slotLabel = computed(() => SLOTS[props.side.cardState] ?? 'Карта закрыта');
</script>
