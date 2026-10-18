<template>
  <div
    :class="frameClass"
    :style="{ '--hero-color': heroColor }"
    :aria-current="isCurrent ? 'true' : undefined"
    role="button"
    tabindex="0"
    :aria-label="`Карточка героя: ${playerName}`"
    @click="openHero"
    @keydown.enter.prevent="openHero"
    @keydown.space.prevent="openHero"
  >
    <div
      class="rounded-8 bg-surface text-ink relative flex flex-col gap-2 bg-[linear-gradient(180deg,rgb(255_255_255/4%),transparent_55%),radial-gradient(rgb(255_255_255/7%)_1px,transparent_1px)] bg-[size:auto,10px_10px] p-8"
    >
      <div v-if="!isMe" data-card-counts class="absolute -top-28 -right-2 h-36 w-176">
        <svg
          class="absolute inset-0 size-full"
          viewBox="0 0 176 36"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <clipPath :id="tabClipId" clipPathUnits="objectBoundingBox">
              <path :d="TAB_CLIP" />
            </clipPath>
          </defs>
          <path class="fill-surface" :d="TAB_SHAPE" />
          <path class="fill-white/4" :d="TAB_SHAPE" />
        </svg>

        <div
          data-card-counts-skin
          class="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/7%)_1px,transparent_1px)]"
          :style="tabSkin"
        />

        <svg
          class="absolute inset-0 size-full"
          viewBox="0 0 176 36"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            :class="FRAME_STROKE[frameTone]"
            :d="TAB_EDGE"
            fill="none"
            stroke-width="2"
            stroke-linejoin="round"
          />
        </svg>

        <div class="absolute inset-0 flex items-center justify-between pr-10 pl-44">
          <ATooltip :text="TOOLTIPS.playerCard.handCount({ count: handCount })">
            <div class="flex items-center gap-5">
              <component
                :is="ICON"
                name="lucide:hand"
                class="text-dim size-15"
                aria-hidden="true"
              />
              <span class="text-15 text-ink font-semibold lining-nums">{{ handCount }}</span>
            </div>
          </ATooltip>

          <ATooltip :text="TOOLTIPS.playerCard.deckCount({ count: deckCount })">
            <div class="flex items-center gap-5">
              <component
                :is="ICON"
                name="lucide:layers"
                class="text-dim size-15"
                aria-hidden="true"
              />
              <span class="text-15 text-ink font-semibold lining-nums">{{ deckCount }}</span>
            </div>
          </ATooltip>

          <ATooltip :text="TOOLTIPS.playerCard.discardCount({ count: discardCount })">
            <button
              type="button"
              data-discard-open
              class="group flex items-center gap-5"
              :class="discardCount > 0 ? 'cursor-pointer' : 'cursor-default'"
              :aria-label="TOOLTIPS.playerCard.discardCount({ count: discardCount })"
              @click.stop="openDiscard"
            >
              <component
                :is="ICON"
                name="lucide:trash-2"
                class="text-dim size-15 transition-colors"
                :class="discardLit"
                aria-hidden="true"
              />
              <span
                class="text-15 text-ink font-semibold lining-nums transition-colors"
                :class="discardLit"
              >
                {{ discardCount }}
              </span>
            </button>
          </ATooltip>
        </div>
      </div>

      <div class="flex items-start gap-8">
        <ATooltip :text="hero ? faceTitle(hero) : ''">
          <AAvatar
            :alt="heroName"
            :ui="{
              avatar_root: heroRingClass,
              avatar_image: portraitClass(hero, props.player),
              avatar_fallback: portraitClass(hero, props.player),
            }"
          />
        </ATooltip>

        <div class="flex h-74 min-w-0 flex-1 flex-col">
          <div class="flex shrink-0 items-start justify-between gap-6">
            <div class="flex min-w-0 flex-col">
              <ATooltip v-if="heroName" :text="skillTitle">
                <span class="text-16 min-w-0 shrink-0 truncate font-semibold uppercase">
                  {{ heroName }}
                </span>
              </ATooltip>
              <ATooltip v-if="!isAi && playerName" :text="playerTitle">
                <span class="text-15 text-dim min-w-0 truncate font-medium">{{ playerName }}</span>
              </ATooltip>
            </div>

            <div class="flex shrink-0 items-center gap-6">
              <span
                v-if="showSkill"
                data-skill-badge
                class="text-13 rounded-3 bg-info text-app shrink-0 px-6 py-4 font-semibold -tracking-[0.04em] uppercase"
              >
                Умение
              </span>

              <span
                v-if="showPlacement"
                class="text-13 rounded-3 bg-violet shrink-0 px-6 py-4 font-semibold -tracking-[0.04em] uppercase"
              >
                Расстановка
              </span>

              <ATooltip v-if="showActions" :text="actionsTitle">
                <div class="flex shrink-0 items-center gap-6">
                  <div
                    class="bg-accent before:bg-accent relative size-8 shrink-0 rounded-full before:absolute before:inset-0 before:animate-ping before:rounded-full before:content-['']"
                    aria-hidden="true"
                  />
                  <span class="text-15 font-semibold">{{ actionLabel }}</span>
                </div>
              </ATooltip>
            </div>
          </div>

          <div class="mt-auto mb-4 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-6">
              <PlayerCardRange
                :attack-range="heroStats.attackRange"
                :move="heroStats.move"
                class="font-semibold"
              />

              <ATooltip v-if="hero" :text="healthTitle">
                <span class="text-15 shrink-0 self-end leading-18 font-semibold lining-nums">
                  {{ hpLabel(hero) }}
                </span>
              </ATooltip>
            </div>

            <div v-if="hero" class="relative">
              <div
                class="border-line/40 bg-surface-2 relative block h-8 w-full shrink-0 overflow-hidden rounded-full border shadow-[inset_0_1px_3px_0_rgb(0_0_0/45%),inset_0_-1px_0_0_rgb(255_255_255/22%)]"
              >
                <div
                  data-hp-bar
                  class="block h-full rounded-full bg-[linear-gradient(180deg,var(--hp-glow),var(--hp-color))] transition-[width] duration-500 ease-out"
                  :class="isHit(hero.id) && 'player-card-hp-hit'"
                  :style="hpStyle(hero)"
                  aria-hidden="true"
                />
                <div
                  class="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-full bg-[linear-gradient(180deg,rgb(255_255_255/28%),transparent)]"
                  aria-hidden="true"
                />
              </div>

              <span
                v-for="hit in heroHits"
                :key="hit.key"
                data-hp-damage
                class="damage-float text-danger text-15 pointer-events-none absolute -top-8 right-0 font-bold lining-nums"
              >
                −{{ hit.amount }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-end justify-between gap-8">
        <div
          class="flex max-w-none flex-nowrap items-end justify-start gap-2 overflow-visible empty:hidden"
          @click.stop
        >
          <ATooltip v-for="item in visibleItems" :key="item.id" :text="itemTitle(item)">
            <div
              data-item
              :class="[
                'flex size-30 shrink-0 items-center justify-center transition-colors',
                isItemOn(item) ? 'text-[var(--item-color)]' : 'text-gray',
              ]"
              :style="{ '--item-color': item.color }"
            >
              <component
                :is="ICON"
                v-if="itemIcon(item)"
                :name="itemIcon(item)"
                class="size-30!"
                aria-hidden="true"
              />
            </div>
          </ATooltip>

          <ATooltip v-if="hiddenItems" :text="hiddenItemsTitle">
            <span class="text-15 shrink-0 font-semibold lining-nums" @click.stop>
              +{{ hiddenItems }}
            </span>
          </ATooltip>
        </div>

        <div v-if="sidekicks.length" class="ml-auto flex items-end gap-8">
          <div class="flex min-w-0 flex-col items-end gap-4">
            <TransitionGroup name="squad-name" tag="div" class="flex min-w-0 justify-end">
              <span
                :key="selected?.id ?? 'none'"
                class="text-17 min-w-0 truncate text-right font-medium"
              >
                {{ selected?.name }}
              </span>
            </TransitionGroup>
            <div v-if="selected" class="flex shrink-0 items-center gap-6">
              <ATooltip :text="squadTitle(selected)">
                <span class="text-15 font-medium lining-nums">HP {{ hpLabel(selected) }}</span>
              </ATooltip>
              <PlayerCardRange
                :attack-range="selectedStats.attackRange"
                :move="selectedStats.move"
                class="font-medium"
              />
            </div>
          </div>

          <div class="relative flex shrink-0 items-center" @click.stop="selectSidekick($event)">
            <span
              v-for="hit in sidekickHits"
              :key="hit.key"
              data-face-damage
              class="damage-float text-danger text-15 pointer-events-none absolute -top-10 z-30 font-bold lining-nums"
              :style="hit.style"
            >
              −{{ hit.amount }}
            </span>

            <TransitionGroup name="face">
              <ATooltip
                v-for="(sidekick, index) in orderedSidekicks"
                :key="sidekick.id"
                :text="faceTitle(sidekick)"
              >
                <AAvatar
                  data-face
                  :data-face-id="String(sidekick.id)"
                  :alt="sidekick.name || heroName"
                  :ui="{
                    avatar_root: cn(
                      'size-46 border-3 transition-[filter,box-shadow,transform]',
                      ringClass(sidekick, props.player),
                      // стопка лежит друг на друге (аватарки внахлёст), выбранная выходит вперёд
                      index === orderedSidekicks.length - 1 ? 'mr-0 z-10' : '-mr-20',
                    ),
                    avatar_image: portraitClass(sidekick, props.player),
                    avatar_fallback: portraitClass(sidekick, props.player),
                  }"
                />
              </ATooltip>
            </TransitionGroup>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, watch } from 'vue';
import AAvatar from '~/components/atoms/AAvatar.vue';
import ATooltip from '~/components/atoms/ATooltip.vue';
import PlayerCardRange from '~/components/molecules/game/PlayerCardRange.vue';
import { HEALTH_TONES } from '~/constants/health.js';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import {
  healthTone,
  hpLabel,
  hpPercent,
  itemStateLabel,
} from '~/composables/game/useGameHelpers.js';
import { useProfile } from '~/composables/ui/useProfile';
import { useSettings } from '~/composables/ui/useSettings.js';
import { openModal } from '~/composables/ui/useModal.js';
import { cn } from '~/ui/cn.js';

const props = defineProps({
  player: { type: Object, required: true },
  catalog: { type: Object, default: () => ({}) },
});

const { nick } = useProfile();
const {
  you,
  currentPlayerId,
  isPlacement,
  actionsLeft,
  actionsTotal,
  actionsBonus,
  battleRoles,
  lastSkill,
  targeting,
  movement,
} = useGameSession();

const openHero = () => openModal('heroDetails', String(props.player.id));

const HERO_RING = 'border-[var(--hero-color)]';

const PORTRAIT = 'bg-surface-2 flex size-full items-center justify-center';
const PORTRAIT_OUT = 'grayscale';

const MAX_ITEMS = 3;
const ICON = 'Icon';

const TAB_SHAPE = 'M0 36 L0 26 L27.9 5.86 Q36 0 46 0 L168 0 Q176 0 176 8 L176 36 Z';
const TAB_EDGE = 'M0.46 26.89 L28.35 6.75 Q36.46 0.89 46.46 0.89 L167 0.89 Q175 0.89 175 9 L175 36';
const TAB_CLIP = 'M0 1 L0 0.7222 L0.1585 0.1628 Q0.2045 0 0.2614 0 L0.9545 0 Q1 0 1 0.2222 L1 1 Z';

const pickedId = ref(null);

const isMe = computed(() => String(props.player?.id) === String(you.value));
const isCurrent = computed(() =>
  currentPlayerId.value == null
    ? false
    : String(props.player?.id) === String(currentPlayerId.value),
);
const actions = computed(() => {
  if (!isCurrent.value) return { left: 0, total: 0, bonus: 0 };
  return {
    left: Number(actionsLeft.value) || 0,
    total: Number(actionsTotal.value) || 0,
    bonus: Number(actionsBonus.value) || 0,
  };
});

const playerName = computed(() => (isMe.value ? nick.value : String(props.player?.name ?? '')));
const heroColor = computed(() => props.player?.color || 'var(--color-dim)');
const isAi = computed(() => String(props.player?.control ?? '').toLowerCase() === 'ai');

const handCount = computed(() =>
  Number(props.player?.handCount ?? props.player?.hand?.length ?? 0),
);
const deckCount = computed(() => Number(props.player?.deckCount ?? 0));
const discardCount = computed(() =>
  Number(props.player?.discardCount ?? props.player?.discard?.length ?? 0),
);

const openDiscard = () => {
  if (discardCount.value <= 0) return;
  openModal('discard', { playerId: String(props.player.id) });
};

const discardLit = computed(() => (discardCount.value > 0 ? 'group-hover:text-accent' : ''));

const tabClipId = computed(() => `tab-counts-${props.player.id}`);
const tabSkin = computed(() => ({
  clipPath: `url(#${tabClipId.value})`,
  backgroundSize: '10px 10px',
  backgroundPosition: 'calc(var(--spacing) * -202) calc(var(--spacing) * 28)',
}));

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

const skillTitle = computed(() => {
  const skill = props.catalog?.skill;
  if (!skill?.text) return heroName.value;
  return TOOLTIPS.playerCard.heroSkill({ title: skill.title, text: skill.text });
});

const playerTitle = computed(() => TOOLTIPS.playerCard.player({ name: playerName.value }));
const healthTitle = computed(() => TOOLTIPS.playerCard.health({ hp: hpLabel(hero.value) }));

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

const orderedSidekicks = computed(() => {
  const list = [...sidekicks.value];
  const at = list.findIndex(fighter => String(fighter.id) === String(selected.value?.id));
  if (at < 0 || at === list.length - 1) return list;
  return [...list.slice(0, at), ...list.slice(at + 1), list[at]];
});

const selectedStats = computed(() => statsOf(selected.value));

const select = id => {
  pickedId.value = String(id);
};

const selectSidekick = event => {
  const id = event?.target?.closest?.('[data-face-id]')?.getAttribute('data-face-id');
  if (id) select(id);
};
const isDead = fighter => Number(fighter?.currentHp ?? 0) <= 0;

const awaitsPlacement = (fighter, owner) =>
  isPlacement.value && owner?.placementReady !== true && fighter?.currentPosition == null;
const outOfPlay = (fighter, owner) => isDead(fighter) || awaitsPlacement(fighter, owner);

const portraitClass = (fighter, owner) => cn(PORTRAIT, outOfPlay(fighter, owner) && PORTRAIT_OUT);
const heroRingClass = computed(() =>
  cn(
    'size-74 border-3',
    awaitsPlacement(hero.value, props.player) ? HEALTH_TONES.down.ring : HERO_RING,
  ),
);
const ringClass = (fighter, owner) =>
  outOfPlay(fighter, owner) ? HEALTH_TONES.down.ring : HEALTH_TONES[healthTone(fighter).key].ring;

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
  TOOLTIPS.playerCard.item({
    name: item?.name || item?.id,
    state: itemStateLabel(item, item?.state),
  });
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
const actionsTitle = computed(() =>
  TOOLTIPS.playerCard.actions({
    left: actionLeft.value,
    total: actionTotal.value,
    bonus: Number(actions.value.bonus) || 0,
  }),
);

const showPlacement = computed(() => isPlacement.value && props.player?.placementReady === false);
const showActions = computed(() => isCurrent.value && !isPlacement.value && actionTotal.value > 0);

const battleRole = computed(() => {
  const roles = battleRoles.value;
  const id = String(props.player?.id ?? '');
  if (id === '') return null;
  if (id === roles.attackerPlayerId) return 'attacker';
  if (id === roles.defenderPlayerId) return 'defender';
  return null;
});

const skillId = computed(() =>
  props.player?.skill?.id == null ? null : String(props.player.skill.id),
);
const skillMine = computed(() => String(props.player?.id ?? '') === String(you.value ?? ''));
const skillWindow = computed(() => {
  if (!skillMine.value) return false;
  const window = targeting.value;
  if (!window || skillId.value == null) return false;
  if (String(window.source ?? '') !== skillId.value) return false;
  return String(window.playerId ?? '') === String(props.player?.id ?? '');
});
const skillMovement = computed(() => {
  if (!skillMine.value) return false;
  const draft = movement.value;
  if (!draft || skillId.value == null) return false;
  return String(draft.source ?? '') === skillId.value;
});

const skillFired = computed(() => {
  const fired = lastSkill.value;
  if (!fired || !skillMine.value || skillId.value == null) return false;
  return (
    String(fired.skillId) === skillId.value &&
    String(fired.playerId ?? '') === String(props.player?.id ?? '')
  );
});

const showSkill = computed(
  () =>
    props.player?.skillActive === true ||
    skillWindow.value ||
    skillMovement.value ||
    skillFired.value,
);

const hpSeen = new Map();
const hits = ref([]);
const floats = ref([]);
const damageTimers = [];
let damageSeq = 0;
const { duration } = useSettings();

const rememberHit = (fighterId, amount) => {
  const id = String(fighterId);
  const key = `${id}-${(damageSeq += 1)}`;
  hits.value = [...hits.value, id];
  floats.value = [...floats.value, { key, fighterId: id, amount }];

  damageTimers.push(
    setTimeout(() => {
      hits.value = hits.value.filter(entry => entry !== id);
      floats.value = floats.value.filter(entry => entry.key !== key);
    }, duration('damageFloat')),
  );
};

watch(
  fighters,
  list => {
    for (const fighter of list) {
      const id = String(fighter.id);
      const now = Number(fighter.currentHp ?? 0);
      const before = hpSeen.get(id);
      hpSeen.set(id, now);
      if (before == null || now >= before) continue;
      rememberHit(id, before - now);
    }
  },
  { immediate: true, deep: true },
);

const isHit = fighterId => hits.value.includes(String(fighterId));
const heroHits = computed(() =>
  floats.value.filter(entry => entry.fighterId === String(hero.value?.id ?? '')),
);
const sidekickHits = computed(() => {
  const list = sidekicks.value;
  return floats.value
    .filter(entry => list.some(fighter => String(fighter.id) === entry.fighterId))
    .map(entry => {
      const index = list.findIndex(fighter => String(fighter.id) === entry.fighterId);

      return { ...entry, style: { right: `${(list.length - 1 - index) * 26 + 10}px` } };
    });
});

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
  const stats = move || attackRange ? TOOLTIPS.playerCard.fighterStats({ move, attackRange }) : '';
  return [
    TOOLTIPS.playerCard.fighter({ name: fighter.name, hp: hpLabel(fighter) }),
    stats,
    isDead(fighter) && TOOLTIPS.playerCard.fighterDown(),

    !isDead(fighter) &&
      awaitsPlacement(fighter, props.player) &&
      TOOLTIPS.playerCard.fighterOffField(),
  ]
    .filter(Boolean)
    .join(' · ');
};
const squadTitle = fighter =>
  TOOLTIPS.playerCard.squad({ name: fighter.name, hp: hpLabel(fighter) });

const FRAME_STROKE = {
  danger: 'stroke-danger',
  info: 'stroke-info',
  accent: 'stroke-accent',
  line: 'stroke-line',
};

const FRAME_BORDER = {
  danger:
    'border-danger shadow-[0_0_16px_0_color-mix(in_srgb,var(--color-danger)_45%,transparent)]',
  info: 'border-info shadow-[0_0_16px_0_color-mix(in_srgb,var(--color-info)_45%,transparent)]',
  accent:
    'border-accent shadow-[0_0_16px_0_color-mix(in_srgb,var(--color-accent)_45%,transparent)]',
  line: 'border-line',
};

const frameTone = computed(() => {
  if (battleRole.value === 'attacker') return 'danger';
  if (battleRole.value === 'defender') return 'info';
  return isCurrent.value ? 'accent' : 'line';
});

const frameClass = computed(() =>
  cn(
    'relative w-380 shrink-0 rounded-8 border-2',

    !isMe.value && 'mt-28',

    FRAME_BORDER[frameTone.value],
    hero.value && isDead(hero.value) && 'opacity-60',
  ),
);

onBeforeUnmount(() => damageTimers.forEach(timer => clearTimeout(timer)));
</script>
