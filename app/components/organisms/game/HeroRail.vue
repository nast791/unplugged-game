<template>
  <section class="pointer-events-none absolute bottom-14 left-14 z-20 flex items-end gap-10">
    <div
      v-for="player in ordered"
      :key="player.id"
      class="pointer-events-auto relative"
      :class="panelOf(player) ? 'z-40' : 'z-0'"
    >
      <HeroInfo
        v-if="tabOf(player)"
        :mode="tabOf(player)"
        :player="player"
        :hero="heroOf(player)"
        :color="player.color"
        :catalog="heroPack(player.id)"
        :move-bonus="moveBonusOf(player)"
        @switch="openInfoTab(player, $event)"
      />

      <PilesInfo v-if="pilesOf(player)" :player="player" @open="openPile(player, $event)" />

      <div class="absolute -top-31 left-1/2 flex -translate-x-1/2 items-end gap-3">
        <SlotCard
          icon="lucide:info"
          :label="TOOLTIPS.rail.info()"
          :out="Boolean(tabOf(player))"
          out-class="-translate-y-10"
          @click="toggleInfo(player)"
        />

        <SlotCard
          :count="countOf(player, 'hand')"
          count-class="text-18"
          :label="pilesLabel(player)"
          :empty="countOf(player, 'hand') <= 0"
          :out="Boolean(pilesOf(player))"
          out-class="-translate-y-10"
          drop="discard"
          @click="togglePiles(player)"
        />
      </div>

      <HeroHex
        class="relative z-20"
        :portrait="portraitOf(player)"
        :name="heroOf(player)?.name"
        :color="player.color"
        :hp="hpOf(player)"
        :actions="hexActions(player)"
        :action-left="hexActionPair(player)?.left"
        :action-total="hexActionPair(player)?.total"
        :active="isCurrent(player)"
        :dead="isDead(heroOf(player))"
        :silent="Boolean(panelOf(player))"
        :label="hexLabel(player)"
        @click="openHero(player)"
      />
    </div>
  </section>
</template>

<script setup>
import HeroHex from '~/components/molecules/game/HeroHex.vue';
import HeroInfo from '~/components/molecules/game/HeroInfo.vue';
import PilesInfo from '~/components/molecules/game/PilesInfo.vue';
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
  return { left: Math.min(total, left), total };
};

const hexActions = player => {
  const pair = hexActionPair(player);
  return pair ? TOOLTIPS.rail.heroActions({ left: pair.left, total: pair.total }) : '';
};

const moveBonusOf = player =>
  isCurrent(player) ? Math.max(0, Number(movementBonus.value ?? 0)) : 0;

const panelOf = player =>
  panel.value && String(panel.value.playerId) === String(player?.id) ? panel.value : null;

const tabOf = player => (panelOf(player)?.kind === 'info' ? panelOf(player).tab : '');

const pilesOf = player => (panelOf(player)?.kind === 'piles' ? panelOf(player) : null);

// Вкладок в панели три, но панель одна: открыть можно только её, а какую из вкладок показать
// первой — диктует состав героя.
const firstTab = player => {
  if (heroOf(player)) return 'hero';
  if (sidekicksOf(player).length) return 'fighters';
  return 'items';
};

const toggleInfo = player => {
  panel.value = tabOf(player)
    ? null
    : { playerId: String(player.id), kind: 'info', tab: firstTab(player) };
};

const togglePiles = player => {
  panel.value = pilesOf(player) ? null : { playerId: String(player.id), kind: 'piles' };
};

const openInfoTab = (player, tab) => {
  if (tabOf(player)) panel.value = { playerId: String(player.id), kind: 'info', tab };
};

const pilesLabel = player =>
  TOOLTIPS.rail.piles({
    hand: countOf(player, 'hand'),
    deck: countOf(player, 'deck'),
    discard: countOf(player, 'discard'),
  });

const openPile = (player, key) => {
  panel.value = null;
  openModal(key, { playerId: String(player.id) });
};

const openHero = player => openModal('heroDetails', String(player.id));
</script>
