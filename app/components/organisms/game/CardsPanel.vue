<template>
  <section
    ref="panel"
    class="pointer-events-none relative flex w-fit min-w-0 items-end gap-8 p-12"
  >
    <div ref="content" class="relative min-w-0">
      <div ref="containerRef" class="swiper pointer-events-auto w-full overflow-visible! px-16 pt-32">
        <div class="swiper-wrapper">
          <div
            v-for="(card, index) in orderedHand"
            :key="cardKeyOf(card)"
            class="swiper-slide w-110 shrink-0"
            :class="slideClass(card)"
            :style="{ zIndex: cardDepth(card, index) }"
          >
            <ATooltip :text="TOOLTIPS.hand.card()">
              <Card
                data-hand-card
                :data-card-key="cardKeyOf(card)"
                :card="card"
                :disabled="isDisabled(card)"
                :class="draggingCard(card) ? 'opacity-30' : ''"
                @pointerdown="onCardPointerDown(card, $event)"
                @click="handClick(card)"
                @contextmenu.prevent="zoom(card)"
              />
            </ATooltip>
          </div>
        </div>
      </div>

      <AArrowButton
        direction="prev"
        label="Сдвинуть карты влево"
        class="absolute top-1/2 -left-20 z-20 -translate-y-1/2"
        @click="slidePrev"
        v-if="!isFirstVisible"
      />

      <AArrowButton
        direction="next"
        label="Сдвинуть карты вправо"
        class="absolute top-1/2 -right-20 z-20 -translate-y-1/2"
        @click="slideNext"
        v-if="!isLastVisible"
      />
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
        <Card :card="zoomed" class="origin-center scale-220" />
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import AArrowButton from '~/components/atoms/AArrowButton.vue';
import ATooltip from '~/components/atoms/ATooltip.vue';
import Card from '~/components/molecules/game/Card.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { CARD_TYPE_ORDER } from '~/constants/cards.js';
import { useCardDrag } from '~/composables/ui/useCardDrag.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { useSwiper } from '~/composables/ui/useSwiper.js';

const {
  myHand: hand,
  isCardPlayable,
  onCardClick: playCard,
  canDiscardBonus,
  armedBonusCard,
  armBonusCard,
  onBonusDiscard,
} = useGameSession();

const content = ref(null);

defineExpose({ fitNode: () => content.value });

const {
  drag,
  over: cardDragOver,
  startCardDrag,
  moveCardDrag,
  setCardDragOver,
  endCardDrag,
} = useCardDrag();

const frontKey = ref('');
const zoomed = ref(null);
const zoomRoot = ref(null);

const cardKeyOf = card => String(card?.instanceId ?? card?.id ?? '');
const brought = card => frontKey.value === cardKeyOf(card);

const typeRank = card => {
  const index = CARD_TYPE_ORDER.indexOf(String(card?.type));
  return index < 0 ? CARD_TYPE_ORDER.length : index;
};

const orderedHand = computed(() =>
  [...hand.value].sort((left, right) => {
    const byType = typeRank(left) - typeRank(right);
    if (byType) return byType;
    const byValue = (Number(right?.value) || 0) - (Number(left?.value) || 0);
    if (byValue) return byValue;
    return String(left?.title ?? '').localeCompare(String(right?.title ?? ''), 'ru');
  }),
);

const {
  containerRef,
  slideNext,
  slidePrev,
  isFirstVisible,
  isLastVisible,
  update,
  setEnabled: setSwiperEnabled,
} = useSwiper({
  swiper: {
    slidesPerView: 'auto',
    slidesPerGroup: 1,
    spaceBetween: 0,
    grabCursor: true,
    watchOverflow: true,
    watchSlidesProgress: true,
    mousewheel: { forceToAxis: true },
  },
});

watch(
  () => orderedHand.value.map(cardKeyOf).join('|'),
  () => nextTick(() => update()),
);

const isDisabled = card => !isCardPlayable(card);

const dragging = ref(false);
const draggingCard = card => drag.active && String(drag.key) === cardKeyOf(card);

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

const DRAG_THRESHOLD = 10;
let dragStart = null;

const onDragMove = event => {
  if (!dragStart) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;

  if (!dragStart.active) {
    if (Math.abs(dy) < DRAG_THRESHOLD || Math.abs(dy) < Math.abs(dx)) return;
    dragStart.active = true;
    setSwiperEnabled(false);
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
  setSwiperEnabled(true);
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

onBeforeUnmount(() => {
  releaseDrag();
  dragStart = null;
});

const zoom = card => {
  zoomed.value = card;
};

const closeZoom = () => {
  zoomed.value = null;
  frontKey.value = '';
};

const onScreenClick = event => {
  if (event?.target?.closest?.('[data-hand-card]')) return;
  frontKey.value = '';
};

onMounted(() => document.addEventListener('click', onScreenClick, true));
onBeforeUnmount(() => document.removeEventListener('click', onScreenClick, true));

watch(zoomed, async card => {
  if (!card) return;
  await nextTick();
  zoomRoot.value?.focus?.();
});

const cardDepth = (card, index) => (brought(card) ? orderedHand.value.length + 1 : index + 1);

const slideClass = card => [
  'cursor-pointer transition-transform duration-200',

  brought(card) ? '-translate-y-24' : 'hover:-translate-y-8',
];
</script>
