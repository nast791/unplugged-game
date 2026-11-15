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
        class="cursor-pointer"
        :data-hand-slot="cardKeyOf(card)"
        :style="slotStyle(card, index)"
        @mouseenter="raise(card)"
        @mouseleave="lower(card)"
      >
        <div
          class="transition-transform duration-200"
          :class="raised(card) ? '-translate-y-140' : null"
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
              @contextmenu.prevent="openDetail(card)"
            />
          </ATooltip>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="detail"
        ref="detailRoot"
        data-esc-layer
        class="bg-app/85 backdrop-blur-8 fixed inset-0 z-50 flex cursor-zoom-out flex-col items-center justify-center gap-16 p-24"
        tabindex="-1"
        @click="closeDetail"
        @contextmenu.prevent="closeDetail"
        @keydown.escape="closeDetail"
        @keydown.left.prevent="step(-1)"
        @keydown.right.prevent="step(1)"
      >
        <div data-zoom-card class="h-649 w-440 cursor-auto" @click.stop @contextmenu.prevent.stop>
          <Card
            :card="detail"
            mode="detail"
            :disabled="!detailPlayable"
            class="origin-top-left scale-220"
          />
        </div>

        <div
          data-detail-controls
          class="flex cursor-auto flex-col items-center gap-8"
          @click.stop
          @contextmenu.prevent.stop
        >
          <div class="flex items-center gap-16">
            <span class="text-16 text-white/70" data-detail-count>
              Карт в руке: {{ orderedHand.length }}
            </span>

            <ATooltip :text="TOOLTIPS.card.play()">
              <AButton
                variant="secondary"
                data-detail-play
                :disabled="!detailPlayable"
                @click="playDetail"
              >
                Разыграть
              </AButton>
            </ATooltip>
          </div>

          <div class="flex items-center gap-12">
            <ATooltip :text="TOOLTIPS.card.prev()">
              <AButton
                variant="secondary"
                icon
                data-detail-prev
                :disabled="singleCard"
                @click="step(-1)"
              >
                <Icon name="lucide:chevron-left" class="size-22!" aria-hidden="true" />
              </AButton>
            </ATooltip>

            <ATooltip :text="TOOLTIPS.card.next()">
              <AButton
                variant="secondary"
                icon
                data-detail-next
                :disabled="singleCard"
                @click="step(1)"
              >
                <Icon name="lucide:chevron-right" class="size-22!" aria-hidden="true" />
              </AButton>
            </ATooltip>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { cardBonus } from '#shared/helpers/cards.js';
import AButton from '~/components/atoms/AButton.vue';
import ATooltip from '~/components/atoms/ATooltip.vue';
import Card from '~/components/molecules/game/Card.vue';
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
  disarmBonusCard,
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
const detailRoot = ref(null);
const cardWidth = ref(0);
const expose = ref(0);

const hoverKey = ref('');
const detailKey = ref('');
const dragging = ref(false);

const cardKeyOf = card => String(card?.instanceId ?? card?.id ?? '');
const raised = card => hoverKey.value === cardKeyOf(card);
const draggingCard = card => drag.active && String(drag.key) === cardKeyOf(card);

const raise = card => (hoverKey.value = cardKeyOf(card));

const lower = card => {
  if (hoverKey.value === cardKeyOf(card)) hoverKey.value = '';
};

const orderedHand = computed(() => sortHandCards(hand.value));

const overlap = computed(() => Math.max(0, cardWidth.value - expose.value));

const slotStyle = (card, index) => ({
  marginLeft: index === 0 ? '0' : `-${overlap.value}px`,
  zIndex: raised(card) ? orderedHand.value.length + 1 : orderedHand.value.length - index,
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
  if (!isCardPlayable(card)) return;
  playCard(card);
};

const detail = computed(
  () => orderedHand.value.find(card => cardKeyOf(card) === detailKey.value) ?? null,
);
const detailPlayable = computed(() => Boolean(detail.value) && isCardPlayable(detail.value));
const singleCard = computed(() => orderedHand.value.length < 2);

const openDetail = card => {
  detailKey.value = cardKeyOf(card);
};

const closeDetail = () => {
  detailKey.value = '';
};

const step = direction => {
  const list = orderedHand.value;
  if (list.length < 2) return;
  const index = list.findIndex(card => cardKeyOf(card) === detailKey.value);
  const next = (Math.max(0, index) + direction + list.length) % list.length;
  detailKey.value = cardKeyOf(list[next]);
};

const playDetail = () => {
  const card = detail.value;
  if (!card || !isCardPlayable(card)) return;
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
    dragStart.armed = armBonusCard(dragStart.card);
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
  const armed = dragStart.armed;
  const overDiscard = started && cardDragOver.value === 'discard';
  releaseDrag();
  endCardDrag();
  dragStart = null;
  if (!started) return;

  dragging.value = true;
  setTimeout(() => (dragging.value = false), 140);
  if (overDiscard) onBonusDiscard();
  else {
    if (armed) disarmBonusCard();
  }
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
    armed: false,
  };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragCancel);
};

const onResize = () => measure();

onMounted(() => {
  measure();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  releaseDrag();
  dragStart = null;
  window.removeEventListener('resize', onResize);
});

watch(detail, async card => {
  if (!card) return;
  await nextTick();
  detailRoot.value?.focus?.();
});
</script>
