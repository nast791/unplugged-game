<template>
  <div
    class="pointer-events-none relative h-150 w-173 shrink-0"
    :style="{ '--hero-color': props.color || 'var(--color-line)' }"
  >
    <div
      class="absolute inset-0"
      :class="props.active && 'drop-shadow-[0_0_10px_var(--color-accent)]'"
    >
      <ATooltip :disabled="!props.name || props.silent" side="top" :side-offset="36">
        <button
          type="button"
          class="hex-side-clip pointer-events-auto absolute inset-0 block"
          :aria-label="props.label || props.name"
          @click="emit('click', $event)"
        >
          <AHexagon class="size-full" :ui="skin">
            <APicture
              v-if="props.portrait"
              :src="props.portrait"
              provider="none"
              :alt="props.name"
              :class="['size-full', props.dead && 'grayscale']"
            />

            <span
              v-else
              class="flex size-full items-center justify-center"
              :style="{ background: tint }"
            >
              <span
                class="text-24 leading-none font-semibold tracking-[0.04em] text-[var(--hero-color)]"
                :class="props.dead && 'opacity-40'"
                >{{ initials }}</span
              >
            </span>
          </AHexagon>
        </button>

        <template #content>
          <span class="flex flex-col items-center gap-2">
            <span class="text-14 leading-none font-semibold tracking-[0.08em] uppercase">{{
              props.name
            }}</span>

            <span v-if="props.actions" class="text-12 text-dim leading-none">{{
              props.actions
            }}</span>
          </span>
        </template>
      </ATooltip>
    </div>

    <span
      v-if="props.active && props.actionTotal"
      class="pointer-events-none absolute -bottom-6 -left-2 flex size-54 items-center justify-center"
      data-action-badge
      aria-hidden="true"
    >
      <ActionIcon class="size-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)]" />

      <span
        class="text-17 absolute inset-0 flex items-center justify-center font-bold text-white lining-nums"
      >
        {{ props.actionNow }}/{{ props.actionTotal }}
      </span>
    </span>

    <span
      v-if="props.hp != null"
      class="pointer-events-none absolute -right-2 -bottom-6 flex size-54 items-center justify-center"
      aria-hidden="true"
    >
      <HeartIcon class="size-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)]" />

      <span
        class="text-17 absolute inset-0 flex items-center justify-center pt-2 font-bold text-white lining-nums"
      >
        {{ props.hp }}
      </span>
    </span>
  </div>
</template>

<script setup>
import ATooltip from '~/components/atoms/ATooltip.vue';
import APicture from '~/components/atoms/APicture.vue';
import AHexagon from '~/components/atoms/AHexagon.vue';
import HeartIcon from '~/svg/game/heart.svg';
import ActionIcon from '~/svg/game/action.svg';

const props = defineProps({
  portrait: { type: String, default: '' },
  name: { type: String, default: '' },
  color: { type: String, default: '' },
  hp: { type: [Number, String], default: null },
  actions: { type: String, default: '' },
  actionNow: { type: Number, default: null },
  actionTotal: { type: Number, default: null },
  active: { type: Boolean, default: false },
  dead: { type: Boolean, default: false },
  silent: { type: Boolean, default: false },
  label: { type: String, default: '' },
});

const emit = defineEmits(['click']);

const skin = computed(() => ({
  hexagon_frame: props.active ? 'bg-accent' : 'bg-[var(--hero-color)]',
}));

const tint = computed(() => `linear-gradient(180deg, ${props.color || '#3a4757'}55, #12161b)`);

const initials = computed(() =>
  String(props.name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase(),
);
</script>
