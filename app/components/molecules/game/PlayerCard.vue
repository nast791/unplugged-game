<template>
  <div
    :class="rootClass"
    :style="{ '--hero-color': heroColor }"
    :aria-current="isCurrent ? 'true' : undefined"
    role="button"
    tabindex="0"
    :aria-label="`Карточка героя: ${playerName}`"
    @click="emit('open-hero', props.player.id)"
    @keydown.enter.prevent="emit('open-hero', props.player.id)"
    @keydown.space.prevent="emit('open-hero', props.player.id)"
  >
    <div class="flex items-start gap-8">
      <AAvatar
        :alt="heroName"
        :ui="{
          avatar_root: heroRingClass,
          avatar_image: portraitClass(hero),
          avatar_fallback: portraitClass(hero),
        }"
      />

      <div class="flex h-80 min-w-0 flex-1 flex-col">
        <div class="flex shrink-0 items-start justify-between gap-6">
          <div class="flex min-w-0 flex-col">
            <span
              v-if="heroName"
              class="text-18 min-w-0 shrink-0 truncate font-semibold uppercase"
              :title="`Герой: ${heroName}`"
            >
              {{ heroName }}
            </span>
            <span
              v-if="!isAi && playerName"
              class="text-16 text-dim min-w-0 truncate font-medium"
              :title="`Игрок: ${playerName}`"
            >
              {{ playerName }}
            </span>
          </div>

          <span
            v-if="showPlacement"
            class="text-14 rounded-3 bg-violet shrink-0 px-6 py-4 font-semibold -tracking-[0.04em] uppercase"
          >
            Расстановка
          </span>
          <div
            v-else-if="showActions"
            class="flex shrink-0 items-center gap-6"
            :title="actionsTitle"
          >
            <div
              class="bg-accent before:bg-accent relative size-8 shrink-0 rounded-full before:absolute before:inset-0 before:animate-ping before:rounded-full before:content-['']"
              aria-hidden="true"
            />
            <span class="text-16 font-semibold">{{ actionLabel }}</span>
          </div>
        </div>

        <div class="mt-auto mb-4 flex flex-col gap-2">
          <div class="flex items-center justify-between gap-6">
            <PlayerCardRange
              :attack-range="heroStats.attackRange"
              :move="heroStats.move"
              class="font-semibold"
            />

            <span
              v-if="hero"
              class="text-16 shrink-0 self-end leading-18 font-semibold lining-nums"
              :title="`Здоровье героя: ${hpLabel(hero)}`"
            >
              {{ hpLabel(hero) }}
            </span>
          </div>

          <div
            v-if="hero"
            class="border-line/40 bg-surface-2 relative block h-8 w-full shrink-0 overflow-hidden rounded-full border shadow-[inset_0_1px_3px_0_rgb(0_0_0/45%),inset_0_-1px_0_0_rgb(255_255_255/22%)]"
          >
            <div
              ref="hpFill"
              data-hp-bar
              class="block h-full rounded-full bg-[linear-gradient(180deg,var(--hp-glow),var(--hp-color))] transition-[width] duration-500 ease-out"
              :style="hpStyle(hero)"
              aria-hidden="true"
            />
            <div
              class="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-full bg-[linear-gradient(180deg,rgb(255_255_255/28%),transparent)]"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="flex items-end justify-between gap-8">
      <div
        class="flex max-w-none flex-nowrap items-end justify-start gap-2 overflow-visible empty:hidden"
        @click.stop
      >
        <div
          v-for="item in visibleItems"
          :key="item.id"
          data-item
          :class="[
            'flex size-32 shrink-0 items-center justify-center transition-colors',
            isItemOn(item) ? 'text-info' : 'text-white',
          ]"
          :title="itemTitle(item)"
        >
          <component
            :is="ICON"
            v-if="itemIcon(item)"
            :name="itemIcon(item)"
            class="size-32"
            aria-hidden="true"
          />
        </div>

        <span
          v-if="hiddenItems"
          class="text-16 shrink-0 font-semibold lining-nums"
          :title="hiddenItemsTitle"
          @click.stop
        >
          +{{ hiddenItems }}
        </span>
      </div>

      <div v-if="sidekicks.length" class="ml-auto flex items-end gap-8">
        <div class="flex min-w-0 flex-col items-end gap-4">
          <span class="text-18 min-w-0 truncate text-right font-medium">{{ selected?.name }}</span>
          <div v-if="selected" class="flex shrink-0 items-center gap-6">
            <span class="text-18 font-medium lining-nums" :title="squadTitle(selected)">
              HP {{ hpLabel(selected) }}
            </span>
            <PlayerCardRange
              :attack-range="selectedStats.attackRange"
              :move="selectedStats.move"
              class="font-medium"
            />
          </div>
        </div>

        <div class="relative flex shrink-0 items-center">
          <TransitionGroup name="face">
            <AAvatar
              v-for="(sidekick, index) in orderedSidekicks"
              :key="sidekick.id"
              data-face
              :alt="sidekick.name || heroName"
              :ui="{
                avatar_root: cn(
                  'size-50 border-3 -mr-20 transition-[filter,box-shadow]',
                  ringClass(sidekick),
                  index === orderedSidekicks.length - 1 && 'mr-0',
                ),
                avatar_image: portraitClass(sidekick),
                avatar_fallback: portraitClass(sidekick),
              }"
              :title="faceTitle(sidekick)"
              @click.stop="select(sidekick.id)"
            />
          </TransitionGroup>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, watch } from 'vue';
import AAvatar from '~/components/atoms/AAvatar.vue';
import PlayerCardRange from '~/components/molecules/game/PlayerCardRange.vue';
import { useGameSession } from '~/composables/useGameSession.js';
import { useProfile } from '~/composables/useProfile';
import { healthTone } from '~/utils/game/healthTone.js';
import { hpLabel, hpPercent, itemStateLabel } from '~/utils/gameLabels.js';

const props = defineProps({
  player: { type: Object, required: true },
  catalog: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['open-hero']);

const { nick } = useProfile();
const { you, currentPlayerId, isPlacement, actionsLeft, turn } = useGameSession();

const RING = {
  hero: 'border-[var(--hero-color)]',
  ok: 'border-success',
  mid: 'border-gold',
  low: 'border-danger',
  down: 'border-line',
};

const PORTRAIT = 'bg-surface-2 flex size-full items-center justify-center';
const PORTRAIT_OUT = 'grayscale';

const MAX_ITEMS = 3;
const ICON = 'Icon';

const pickedId = ref(null);
const hpFill = ref(null);

const isMe = computed(() => String(props.player?.id) === String(you.value));
const isCurrent = computed(() =>
  currentPlayerId.value == null
    ? false
    : String(props.player?.id) === String(currentPlayerId.value),
);
const actions = computed(() => {
  if (!isCurrent.value) return { left: 0, total: 0, bonus: 0 };
  const bonus = Number(turn.value?.bonus?.actions) || 0;
  return {
    left: Number(actionsLeft.value) || 0,
    total: (Number(turn.value?.actionsTotal) || 0) + bonus,
    bonus,
  };
});

const playerName = computed(() => (isMe.value ? nick.value : String(props.player?.name ?? '')));
const heroColor = computed(() => props.player?.color || 'var(--color-dim)');
const isAi = computed(() => String(props.player?.control ?? '').toLowerCase() === 'ai');

const fighters = computed(() => props.player?.fighters ?? []);
const hero = computed(() => fighters.value.find(fighter => fighter.type === 'hero') ?? null);
const sidekicks = computed(() => fighters.value.filter(fighter => fighter.type !== 'hero'));
const heroName = computed(() => String(hero.value?.name ?? ''));

const catalogFighters = computed(() => {
  const known = new Map();
  for (const fighter of props.catalog?.fighters ?? []) {
    known.set(String(fighter.id), fighter);
    if (fighter.group) known.set(String(fighter.group), fighter);
  }
  return known;
});

const statsOf = fighter => {
  const known =
    catalogFighters.value.get(String(fighter?.id)) ??
    catalogFighters.value.get(String(fighter?.group)) ??
    {};
  return { move: known.move ?? '', attackRange: known.attackRange ?? '' };
};

const heroStats = computed(() => statsOf(hero.value));

const selected = computed(
  () =>
    sidekicks.value.find(fighter => String(fighter.id) === String(pickedId.value)) ??
    sidekicks.value[sidekicks.value.length - 1] ??
    null,
);
const selectedStats = computed(() => statsOf(selected.value));

const orderedSidekicks = computed(() => {
  const list = [...sidekicks.value];
  const at = list.findIndex(fighter => String(fighter.id) === String(selected.value?.id));
  if (at < 0 || at === list.length - 1) return list;
  return [...list.slice(0, at), ...list.slice(at + 1), list[at]];
});

const select = id => {
  pickedId.value = String(id);
};

const isDead = fighter => Number(fighter?.currentHp ?? 0) <= 0;

const awaitsPlacement = fighter => isPlacement.value && fighter?.currentPosition == null;
const outOfPlay = fighter => isDead(fighter) || awaitsPlacement(fighter);

const portraitClass = fighter => cn(PORTRAIT, outOfPlay(fighter) && PORTRAIT_OUT);
const heroRingClass = computed(() =>
  cn('size-80 border-3', awaitsPlacement(hero.value) ? RING.down : RING.hero),
);
const ringClass = fighter => (outOfPlay(fighter) ? RING.down : RING[healthTone(fighter).key]);

const items = computed(() => props.player?.items ?? []);
const visibleItems = computed(() => items.value.slice(0, MAX_ITEMS));
const hiddenItems = computed(() => Math.max(0, items.value.length - MAX_ITEMS));

const itemCatalog = computed(
  () => new Map((props.catalog?.items ?? []).map(entry => [String(entry.id), entry])),
);
const isItemOn = item => String(item?.state ?? '') === 'active';
const itemIcon = item => {
  const entry = itemCatalog.value.get(String(item?.group ?? item?.id));
  return entry?.icon || item?.icon || '';
};
const itemTitle = item =>
  [item?.name || item?.id, itemStateLabel(item, item?.state), item?.condition]
    .filter(Boolean)
    .join(' · ');
const hiddenItemsTitle = computed(() => items.value.map(itemTitle).join(' · '));

const actionTotal = computed(() => {
  const total = Number(actions.value.total) || 0;
  if (total > 0) return total;
  return (Number(actions.value.left) || 0) + (Number(actions.value.bonus) || 0);
});
const actionLeft = computed(() => {
  const left = Number(actions.value.left) || 0;
  return Math.min(Math.max(left, 0), actionTotal.value);
});
const actionLabel = computed(() => `${actionLeft.value}/${actionTotal.value}`);
const actionsTitle = computed(() => {
  const bonus = Number(actions.value.bonus) || 0;
  const base = `Осталось действий: ${actionLeft.value} из ${actionTotal.value}`;
  return bonus > 0 ? `${base} (+${bonus} в этом ходу)` : base;
});

const showPlacement = computed(() => isPlacement.value && props.player?.placementReady === false);
const showActions = computed(() => isCurrent.value && !isPlacement.value && actionTotal.value > 0);

const hpStyle = fighter => {
  const color = healthTone(fighter).color;
  return {
    'width': `${hpPercent(fighter)}%`,
    '--hp-color': color,
    '--hp-glow': `color-mix(in srgb, ${color} 65%, #ffffff)`,
  };
};

const faceTitle = fighter => {
  const { move, attackRange } = statsOf(fighter);
  return [
    `${fighter.name}: ${hpLabel(fighter)}`,
    move && `шаг ${move}`,
    attackRange && `удар ${attackRange}`,
    isDead(fighter) && 'убит',
    !isDead(fighter) && fighter?.currentPosition == null && 'не на поле',
  ]
    .filter(Boolean)
    .join(' · ');
};
const squadTitle = fighter => `Помощник ${fighter.name}: ${hpLabel(fighter)}`;

const rootClass = computed(() =>
  cn(
    'relative flex w-400 shrink-0 cursor-pointer flex-col gap-2 rounded-8 border-2 border-line bg-surface bg-[linear-gradient(180deg,rgb(255_255_255/4%),transparent_55%),radial-gradient(rgb(255_255_255/7%)_1px,transparent_1px)] bg-[size:auto,10px_10px] p-8 text-ink',
    isCurrent.value &&
      'border-2 border-accent shadow-[0_0_16px_0_color-mix(in_srgb,var(--color-accent)_45%,transparent)]',
    hero.value && isDead(hero.value) && 'opacity-60',
  ),
);

let hitTimer = null;
watch(
  () => Number(hero.value?.currentHp ?? 0),
  (now, before) => {
    hpFill.value?.classList?.remove('player-card-hp-hit');
    if (before == null || now >= before || now <= 0) return;
    requestAnimationFrame(() => hpFill.value?.classList?.add('player-card-hp-hit'));
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => hpFill.value?.classList?.remove('player-card-hp-hit'), 460);
  },
);

onBeforeUnmount(() => clearTimeout(hitTimer));
</script>
