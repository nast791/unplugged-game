<template>
  <section
    v-if="orderedHand.length"
    class="pointer-events-none fixed right-0 z-20 flex items-end justify-end"
    :style="{ bottom: `calc(var(--spacing) * -${SINK})` }"
  >
    <div class="pointer-events-auto flex items-end pr-10">
      <div
        v-for="(card, index) in orderedHand"
        :key="cardKeyOf(card)"
        ref="cardEls"
        class="cursor-pointer transition-transform duration-200"
        :class="brought(card) ? '-translate-y-140' : 'hover:-translate-y-10'"
        :style="slotStyle(card, index)"
      >
        <ATooltip :text="TOOLTIPS.hand.card()">
          <Card
            data-hand-card
            :data-card-key="cardKeyOf(card)"
            :card="card"
            :disabled="isDisabled(card)"
            :boost="isBoosted(card)"
            :class="draggingCard(card) ? 'opacity-30' : ''"
            @pointerdown="onCardPointerDown(card, $event)"
            @click="handClick(card)"
            @contextmenu.prevent="zoom(card)"
          />
        </ATooltip>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="zoomed"
        ref="zoomRoot"
        data-esc-layer
        class="bg-app/85 backdrop-blur-8 fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center p-24"
        tabindex="-1"
        @click="closeZoom"
        @contextmenu.prevent="closeZoom"
        @keydown.escape="closeZoom"
      >
        <div class="flex items-center justify-center gap-32">
          <div
            data-zoom-card
            class="h-649 w-440 cursor-auto"
            @click.stop
            @contextmenu.prevent.stop
            @mouseenter="zoomTextOpen = true"
            @mouseleave="zoomTextOpen = false"
          >
            <Card :card="zoomed" class="origin-top-left scale-220" />
          </div>

          <div
            v-if="zoomTextOpen"
            data-zoom-text
            class="border-line bg-surface text-ink rounded-4 text-26 pointer-events-none max-w-460 border-2 px-16 py-12 shadow-2xl"
          >
            <span class="block font-semibold">{{ zoomed.title }}</span>
            <CardText class="mt-6" :text="zoomed.text" tone="zoom" />
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { cardBonus } from '#shared/helpers/cards.js';
import ATooltip from '~/components/atoms/ATooltip.vue';
import Card from '~/components/molecules/game/Card.vue';
import CardText from '~/components/molecules/game/CardText.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { useCardDrag } from '~/composables/ui/useCardDrag.js';
import { sortHandCards } from '~/composables/game/useGameHelpers.js';
import { useGameSession } from '~/composables/game/useGameSession.js';

const {
  myHand: hand,
  isCardPlayable,
  onCardClick: playCard,
  canDiscardBonus,
  armBonusCard,
  onBonusDiscard,
} = useGameSession();

const SINK = 104;
const MIN_EXPOSE = 22;
const MAX_SHARE = 0.52;
const EXPOSE_SHARE = 0.5;
const DRAG_THRESHOLD = 10;

const {
  drag,
  over: cardDragOver,
  startCardDrag,
  moveCardDrag,
  setCardDragOver,
  endCardDrag,
} = useCardDrag();

const cardEls = ref([]);
const zoomRoot = ref(null);
const cardWidth = ref(0);
const expose = ref(0);

const frontKey = ref('');
const zoomed = ref(null);
const zoomTextOpen = ref(false);
const dragging = ref(false);

const cardKeyOf = card => String(card?.instanceId ?? card?.id ?? '');
const brought = card => frontKey.value === cardKeyOf(card);
const draggingCard = card => drag.active && String(drag.key) === cardKeyOf(card);

const orderedHand = computed(() => sortHandCards(hand.value));

const overlap = computed(() => Math.max(0, cardWidth.value - expose.value));

const slotStyle = (card, index) => ({
  marginLeft: index === 0 ? '0' : `-${overlap.value}px`,
  zIndex: brought(card) ? orderedHand.value.length + 1 : orderedHand.value.length - index,
});

const measure = () => {
  const width = cardEls.value?.[0]?.offsetWidth ?? 0;
  if (!width) return;
  cardWidth.value = width;
  const count = orderedHand.value.length;
  const unit = window.innerWidth / (window.innerWidth < 767 ? 360 : 1920);
  const target = width * EXPOSE_SHARE;
  const share = window.innerWidth * MAX_SHARE;
  const raw = count > 1 ? (share - width) / (count - 1) : target;
  expose.value = Math.max(MIN_EXPOSE * unit, Math.min(target, raw));
};

watch(
  () => orderedHand.value.length,
  () => nextTick(measure),
);

const isDisabled = card => !isCardPlayable(card);
const isBoosted = card => canDiscardBonus.value && cardBonus(card) > 0 && isCardPlayable(card);

const handClick = card => {
  if (dragging.value) return;
  if (!brought(card)) {
    if (frontKey.value === cardKeyOf(card)) return;
    frontKey.value = cardKeyOf(card);
    if (canDiscardBonus.value && isCardPlayable(card)) armBonusCard(card);
    return;
  }
  if (!isCardPlayable(card)) {
    frontKey.value = '';
    return;
  }
  playCard(card);
};

let dragStart = null;

const onDragMove = event => {
  if (!dragStart) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;

  if (!dragStart.active) {
    if (Math.abs(dy) < DRAG_THRESHOLD || Math.abs(dy) < Math.abs(dx)) return;
    dragStart.active = true;
    startCardDrag({
      key: dragStart.key,
      card: dragStart.card,
      x: event.clientX,
      y: event.clientY,
      width: dragStart.rect?.width ?? 0,
      height: dragStart.rect?.height ?? 0,
    });
  }

  moveCardDrag(event.clientX, event.clientY);
  const under = document.elementFromPoint(event.clientX, event.clientY);
  setCardDragOver(under?.closest?.('[data-drop]')?.dataset?.drop ?? '');
};

const releaseDrag = () => {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragCancel);
};

const onDragEnd = () => {
  if (!dragStart) return;
  const started = dragStart.active;
  const overDiscard = started && cardDragOver.value === 'discard';
  releaseDrag();
  endCardDrag();
  dragStart = null;
  if (!started) return;

  dragging.value = true;
  setTimeout(() => (dragging.value = false), 140);
  if (overDiscard) onBonusDiscard();
  else frontKey.value = '';
};

const onDragCancel = () => {
  releaseDrag();
  endCardDrag();
  dragStart = null;
};

const onCardPointerDown = (card, event) => {
  if (event.button !== 0) return;
  if (!canDiscardBonus.value || !isCardPlayable(card)) return;
  dragStart = {
    key: cardKeyOf(card),
    card,
    x: event.clientX,
    y: event.clientY,
    rect: event.currentTarget?.getBoundingClientRect?.() ?? null,
    active: false,
  };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragCancel);
};

const zoom = card => {
  zoomTextOpen.value = false;
  zoomed.value = card;
};

const closeZoom = () => {
  zoomed.value = null;
  zoomTextOpen.value = false;
  frontKey.value = '';
};

const onScreenClick = event => {
  if (event?.target?.closest?.('[data-hand-card]')) return;
  frontKey.value = '';
};

const onResize = () => measure();

onMounted(() => {
  measure();
  document.addEventListener('click', onScreenClick, true);
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  releaseDrag();
  dragStart = null;
  document.removeEventListener('click', onScreenClick, true);
  window.removeEventListener('resize', onResize);
});

watch(zoomed, async card => {
  if (!card) return;
  await nextTick();
  zoomRoot.value?.focus?.();
});
</script>
