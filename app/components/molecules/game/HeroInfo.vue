<template>
  <section
    class="bg-surface/95 border-line rounded-6 backdrop-blur-16 pointer-events-auto absolute bottom-full left-0 z-30 mb-46 flex max-h-[70dvh] w-340 flex-col border-2 shadow-2xl"
    :style="{ '--hero-color': HERO_INFO_TONE }"
  >
    <div class="border-line/70 flex items-baseline justify-between gap-8 border-b-2 px-12 py-8">
      <span class="text-15 leading-none font-semibold tracking-[0.02em] uppercase">
        {{ props.hero?.name || props.player?.name }}
      </span>

      <span class="text-12 tracking-[0.06em] uppercase" :style="{ color: 'var(--hero-color)' }">{{
        label
      }}</span>
    </div>

    <AScroll class="min-h-0 flex-1">
      <div class="flex flex-col gap-8 p-12">
        <template v-if="props.mode === 'hero'">
          <ATooltip :text="TOOLTIPS.playerCard.health({ hp: hpLabel(props.hero) })">
            <div class="flex items-center justify-between gap-8">
              <span class="text-14 text-dim">Здоровье</span>
              <span class="text-17 font-semibold lining-nums">
                {{ hpLabel(props.hero) }}
              </span>
            </div>
          </ATooltip>

          <div class="flex items-center justify-between gap-8">
            <span class="text-14 text-dim">Удар</span>
            <span class="text-17 font-semibold lining-nums">{{
              statLabel(heroStats.attackRange, props.attackBonus)
            }}</span>
          </div>

          <div class="flex items-center justify-between gap-8">
            <span class="text-14 text-dim">Шаг</span>
            <span class="text-17 font-semibold lining-nums">{{
              statLabel(heroStats.move, props.moveBonus)
            }}</span>
          </div>
          <div v-if="skill" class="border-line/70 flex flex-col gap-4 border-t-2 pt-8">
            <span class="text-14 font-semibold">{{ skill.title }}</span>
            <span class="text-13 text-dim leading-[1.3]">{{ skill.text }}</span>
          </div>
        </template>

        <template v-else-if="props.mode === 'fighters'">
          <div v-if="current" class="flex items-center gap-12">
            <div
              class="bg-surface-2 relative size-96 shrink-0 overflow-hidden rounded-full border-2 border-[var(--sidekick-color)]"
              :style="{ '--sidekick-color': props.color || 'var(--color-line)' }"
            >
              <APicture
                v-if="current.image"
                :src="current.image"
                :alt="current.name"
                provider="none"
                class="size-full"
                :class="isDead(current) && 'opacity-45 grayscale'"
              />

              <span
                v-else
                class="text-20 text-dim absolute inset-0 flex items-center justify-center font-semibold"
                :class="isDead(current) && 'opacity-45 grayscale'"
                aria-hidden="true"
              >
                {{ initialsOf(current.name) }}
              </span>
            </div>

            <div class="flex min-w-0 flex-1 flex-col gap-4">
              <span class="text-15 min-w-0 truncate font-medium">{{ current.name }}</span>

              <div
                v-for="row in sidekickStats"
                :key="row.label"
                class="flex items-center justify-between gap-8"
              >
                <span class="text-14 text-dim">{{ row.label }}</span>
                <span class="text-17 font-semibold lining-nums">{{ row.value }}</span>
              </div>
            </div>
          </div>

          <div v-if="sidekicks.length > 1" class="flex items-center justify-between gap-8">
            <button
              type="button"
              class="text-dim hover:text-accent cursor-pointer transition-colors"
              aria-label="Предыдущий помощник"
              @click="step(-1)"
            >
              <Icon name="lucide:chevron-left" class="size-22" aria-hidden="true" />
            </button>

            <span class="text-13 text-dim lining-nums">{{ page }} / {{ sidekicks.length }}</span>

            <button
              type="button"
              class="text-dim hover:text-accent cursor-pointer transition-colors"
              aria-label="Следующий помощник"
              @click="step(1)"
            >
              <Icon name="lucide:chevron-right" class="size-22" aria-hidden="true" />
            </button>
          </div>
        </template>

        <template v-else>
          <div v-for="item in items" :key="item.id" class="flex items-center gap-10">
            <span
              class="flex size-26 shrink-0 items-center justify-center"
              :style="{ '--item-color': item.color }"
            >
              <Icon
                v-if="itemIcon(item)"
                :name="itemIcon(item)"
                class="size-26!"
                :class="isItemOn(item) ? 'text-[var(--item-color)]' : 'text-gray'"
                aria-hidden="true"
              />
            </span>

            <span class="text-14 min-w-0 flex-1 truncate">{{ item.name || item.id }}</span>

            <span class="text-12 text-dim shrink-0">{{ itemStateLabel(item, item.state) }}</span>
          </div>
        </template>
      </div>
    </AScroll>
  </section>
</template>

<script setup>
import APicture from '~/components/atoms/APicture.vue';
import AScroll from '~/components/atoms/AScroll.vue';
import ATooltip from '~/components/atoms/ATooltip.vue';
import { HERO_INFO_TONE } from '~/constants/colors.js';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { hpLabel, itemStateLabel } from '~/composables/game/useGameHelpers.js';

const props = defineProps({
  mode: { type: String, default: 'hero' },
  player: { type: Object, default: () => ({}) },
  hero: { type: Object, default: null },
  color: { type: String, default: '' },
  moveBonus: { type: Number, default: 0 },
  attackBonus: { type: Number, default: 0 },
  catalog: { type: Object, default: () => ({}) },
});

const LABELS = { hero: 'о герое', fighters: 'о помощниках', items: 'о предметах' };

const index = ref(0);

const sidekicks = computed(() =>
  [...(props.player?.fighters ?? []), ...(props.player?.lost ?? [])].filter(
    fighter => fighter.type !== 'hero',
  ),
);

const alive = computed(
  () => sidekicks.value.filter(fighter => Number(fighter?.currentHp ?? 0) > 0).length,
);

const label = computed(() => {
  const base = LABELS[props.mode] ?? '';
  return props.mode === 'fighters' ? `${base} (${alive.value}/${sidekicks.value.length})` : base;
});

const items = computed(() => props.player?.items ?? []);

const page = computed(() => {
  const count = sidekicks.value.length;
  if (!count) return 0;
  return Math.min(index.value + 1, count);
});

const current = computed(() => sidekicks.value[page.value - 1] ?? null);

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
  return {
    move: known.move ?? fighter?.move ?? '',
    attackRange: known.attackRange ?? fighter?.attackRange ?? '',
  };
};

const heroStats = computed(() => statsOf(props.hero));
const currentStats = computed(() => statsOf(current.value));

const statLabel = (base, bonus) => {
  const value = Number(base);
  const extra = Number(bonus) || 0;
  if (!Number.isFinite(value) || extra <= 0) return base;
  return `${value + extra}/${value}`;
};

const sidekickStats = computed(() => {
  const fighter = current.value;
  if (!fighter) return [];

  return [
    { label: 'Здоровье', value: hpLabel(fighter) },
    { label: 'Удар', value: currentStats.value.attackRange },
    { label: 'Шаг', value: currentStats.value.move },
  ];
});

const initialsOf = name =>
  String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join('');

const skill = computed(() => props.catalog?.skill ?? null);

const itemCatalog = computed(
  () => new Map((props.catalog?.items ?? []).map(entry => [String(entry.id), entry])),
);

const isDead = fighter => Number(fighter?.currentHp ?? 0) <= 0;
const isItemOn = item => String(item?.state ?? '') === 'active';

const itemIcon = item => {
  const entry = itemCatalog.value.get(String(item?.group ?? item?.id));
  return entry?.icon || item?.icon || '';
};

const step = delta => {
  const count = sidekicks.value.length;
  if (!count) return;
  index.value = (page.value - 1 + delta + count) % count;
};

watch(
  () => props.mode,
  () => {
    index.value = 0;
  },
);
</script>
