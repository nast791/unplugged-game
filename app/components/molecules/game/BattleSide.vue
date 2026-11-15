<template>
  <article data-battle-side :data-side="side.side" class="flex w-200 shrink-0 flex-col gap-8">
    <div class="flex items-center gap-8">
      <AAvatar :src="side.image || ''" :alt="side.fighterName" :ui="avatarUi" />

      <div class="flex min-w-0 flex-col">
        <span class="text-15 min-w-0 truncate font-semibold">{{ side.fighterName }}</span>
        <span v-if="side.playerName" class="text-13 text-dim min-w-0 truncate">{{
          side.playerName
        }}</span>
      </div>

      <div class="ml-auto flex shrink-0 flex-col items-end gap-2">
        <span
          v-if="hpText"
          class="text-15 font-semibold lining-nums"
          :class="side.dead && 'text-dim'"
          :style="hpStyle"
        >
          {{ hpText }}
        </span>

        <span
          v-if="taken > 0"
          data-battle-taken
          class="text-13 text-danger font-semibold lining-nums"
        >
          урон {{ taken }}
        </span>
      </div>
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
        v-else-if="side.cardState === 'hidden'"
        data-battle-back
        class="rounded-8 relative h-295 w-200 overflow-hidden border-2"
        :class="back ? 'border-line' : 'bg-surface-3 border-transparent'"
        :style="!back && side.color ? { backgroundColor: side.color } : null"
      >
        <APicture v-if="back" provider="none" :src="back" alt="" class="size-full" />
      </div>

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
import APicture from '~/components/atoms/APicture.vue';
import Card from '~/components/molecules/game/Card.vue';

const props = defineProps({
  side: { type: Object, required: true },

  highlight: { type: Array, default: () => [] },

  boost: { type: Object, default: null },

  taken: { type: Number, default: 0 },

  back: { type: String, default: '' },
});

const boostFront = ref(false);
const avatarUi = computed(() => ({
  avatar_root: `size-44 border-2 ${props.side.side === 'attacker' ? 'border-danger' : 'border-info'}`,
  avatar_image: props.side.dead ? 'grayscale' : '',
  avatar_fallback: props.side.dead ? 'grayscale' : '',
}));
const waiting = computed(() => props.side.cardState === 'waiting');
const hpText = computed(() => (props.side.dead ? props.side.deadLabel : props.side.hpLabel));
const hpStyle = computed(() => (props.side.dead ? null : { color: props.side.hpColor }));

const SLOTS = {
  waiting: 'Ждём карту защиты',
  empty: 'Без защиты',
};

const slotLabel = computed(() => SLOTS[props.side.cardState] ?? '');
</script>
