<template>
  <section class="pointer-events-none absolute bottom-14 left-34 z-20 flex items-end gap-10">
    <div
      v-for="player in ordered"
      :key="player.id"
      class="pointer-events-auto relative"
      :class="infoMode(player) ? 'z-40' : 'z-0'"
    >
      <HeroInfo
        v-if="infoMode(player)"
        :mode="infoMode(player)"
        :player="player"
        :hero="heroOf(player)"
        :color="player.color"
        :catalog="heroPack(player.id)"
        :move-bonus="moveBonusOf(player)"
      />

      <div class="absolute -top-31 left-1/2 flex -translate-x-1/2 items-end gap-3">
        <SlotCard
          v-for="slot in infoSlots(player)"
          :key="slot.key"
          :icon="slot.icon"
          :label="slot.label"
          :disabled="slot.disabled"
          :out="infoMode(player) === slot.key"
          out-class="-translate-y-10"
          @click="toggleInfo(player, slot.key)"
        />
      </div>

      <div
        class="absolute top-32 left-11 z-10 flex -translate-x-1/2 -translate-y-1/2 -rotate-60 items-center gap-3"
      >
        <SlotCard
          v-for="slot in pileSlots(player)"
          :key="slot.key"
          :icon="slot.icon"
          :icon-class="slot.iconClass"
          :count="slot.count"
          :count-class="slot.countClass"
          :label="slot.label"
          :empty="slot.empty"
          :disabled="slot.disabled"
          :drop="slot.drop"
          @click="openPile(player, slot.key)"
        />
      </div>

      <HeroHex
        class="relative z-20"
        :portrait="portraitOf(player)"
        :name="heroOf(player)?.name"
        :color="player.color"
        :hp="hpOf(player)"
        :actions="hexActions(player)"
        :action-now="hexActionPair(player)?.now"
        :action-total="hexActionPair(player)?.total"
        :active="isCurrent(player)"
        :dead="isDead(heroOf(player))"
        :silent="Boolean(infoMode(player))"
        :label="hexLabel(player)"
        @click="openHero(player)"
      />
    </div>
  </section>
</template>

<script setup>
import HeroHex from '~/components/molecules/game/HeroHex.vue';
import HeroInfo from '~/components/molecules/game/HeroInfo.vue';
import SlotCard from '~/components/molecules/game/SlotCard.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { hpLabel, playerLabel } from '~/composables/game/useGameHelpers.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { useHeroPacks } from '~/composables/api/heroes.js';
import { openModal } from '~/composables/ui/useModal.js';

const { players, currentPlayerId, actionsLeft, actionsTotal, movementBonus } = useGameSession();

const { load, heroPack } = useHeroPacks();

load();

const panel = ref(null);

const heroOf = player =>
  [...(player?.fighters ?? []), ...(player?.lost ?? [])].find(fighter => fighter.type === 'hero') ??
  null;

const sidekicksOf = player =>
  [...(player?.fighters ?? []), ...(player?.lost ?? [])].filter(fighter => fighter.type !== 'hero');

const isDead = fighter => Number(fighter?.currentHp ?? 0) <= 0;

const countOf = (player, zone) => Number(player?.[`${zone}Count`] ?? player?.[zone]?.length ?? 0);

const portraitOf = player => {
  const fromView = heroOf(player)?.image;
  if (fromView) return String(fromView);
  const pack = heroPack(player.id);
  const fromPack = (pack?.fighters ?? []).find(fighter => fighter.type === 'hero')?.image;
  return String(fromPack || pack?.portrait || '');
};

const isCurrent = player =>
  currentPlayerId.value != null && String(player?.id) === String(currentPlayerId.value);

// Ход переходит по кругу мест, поэтому активный герой всегда встаёт первым, а остальные
// сдвигаются на одно место: ряд не перескакивает с места на место. Очередь начинается справа,
// поэтому ряд развёрнут — активный герой крайний справа, следующие уходят влево.
const ordered = computed(() => {
  const list = [...players.value].sort(
    (left, right) => Number(left?.order ?? 0) - Number(right?.order ?? 0),
  );
  const at = list.findIndex(player => isCurrent(player));
  const queue = at > 0 ? [...list.slice(at), ...list.slice(0, at)] : list;

  return [...queue].reverse();
});

const hpOf = player => {
  const hero = heroOf(player);
  return hero ? Number(hero.currentHp ?? 0) : null;
};

const hexLabel = player =>
  TOOLTIPS.rail.heroHex({
    name: heroOf(player)?.name || playerLabel(player),
    hp: hpLabel(heroOf(player)),
  });

const hexActionPair = player => {
  const total = Number(actionsTotal.value ?? 0);
  if (!isCurrent(player) || total <= 0) return null;
  const left = Math.max(0, Number(actionsLeft.value ?? 0));
  return { now: Math.min(total, total - left + 1), total };
};

const hexActions = player => {
  const pair = hexActionPair(player);
  return pair ? TOOLTIPS.rail.heroActions({ action: pair.now, total: pair.total }) : '';
};

const moveBonusOf = player =>
  isCurrent(player) ? Math.max(0, Number(movementBonus.value ?? 0)) : 0;

const infoMode = player =>
  panel.value && String(panel.value.playerId) === String(player?.id) ? panel.value.mode : '';

const infoSlots = player => [
  {
    key: 'hero',
    icon: 'lucide:info',
    label: TOOLTIPS.rail.hero(),
    disabled: !heroOf(player),
  },
  {
    key: 'fighters',
    icon: 'lucide:users',
    label: TOOLTIPS.rail.fighters(),
    disabled: !sidekicksOf(player).length,
  },
  {
    key: 'items',
    icon: 'lucide:package',
    label: TOOLTIPS.rail.items(),
    disabled: !(player?.items ?? []).length,
  },
];

const pileSlots = player => {
  const hand = countOf(player, 'hand');
  const deck = countOf(player, 'deck');
  const discard = countOf(player, 'discard');

  return [
    {
      key: 'hand',
      countClass: 'text-18',
      count: hand,
      empty: hand <= 0,
      label:
        hand > 0 ? TOOLTIPS.playerCard.handCount({ count: hand }) : TOOLTIPS.playerCard.handEmpty(),
      disabled: !(player?.hand?.length ?? 0),
    },
    {
      key: 'deck',
      icon: 'lucide:layers',
      empty: deck <= 0,
      label:
        deck > 0 ? TOOLTIPS.playerCard.deckCount({ count: deck }) : TOOLTIPS.playerCard.deckEmpty(),
      disabled: !(player?.deckVisible ?? false),
    },
    {
      key: 'discard',
      icon: 'lucide:trash-2',
      label: TOOLTIPS.playerCard.discardCount({ count: discard }),
      empty: discard <= 0,
      disabled: discard <= 0,
      drop: 'discard',
    },
  ];
};

const toggleInfo = (player, mode) => {
  panel.value = infoMode(player) === mode ? null : { playerId: String(player.id), mode };
};

const openPile = (player, key) => openModal(key, { playerId: String(player.id) });

const openHero = player => openModal('heroDetails', String(player.id));
</script>
