<template>
  <section class="relative flex min-w-0 flex-1 items-end gap-8 p-12">
    <div class="relative min-w-0 flex-1">
      <div ref="containerRef" class="swiper w-full px-16 pt-24">
        <div class="swiper-wrapper">
          <div
            v-for="(card, index) in orderedHand"
            :key="cardKeyOf(card)"
            class="swiper-slide w-110 shrink-0"
            :class="slideClass(card)"
            :style="{ zIndex: cardDepth(card, index) }"
          >
            <ATooltip text="ЛКМ — выдвинуть карту и разыграть, ПКМ — увеличить">
              <Card
                data-hand-card
                :card="card"
                :disabled="isDisabled(card)"
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
import { useGameSession } from '~/composables/useGameSession.js';
import { CARD_TYPE_ORDER } from '~/composables/useGameHelpers.js';
import { useSwiper } from '~/composables/useSwiper.js';

const { myHand: hand, isCardPlayable, onCardClick: playCard } = useGameSession();

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

const { containerRef, slideNext, slidePrev, isFirstVisible, isLastVisible, update } = useSwiper({
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

const handClick = card => {
  if (!brought(card)) {
    frontKey.value = cardKeyOf(card);
    return;
  }
  if (!isCardPlayable(card)) {
    frontKey.value = '';
    return;
  }
  playCard(card);
};

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
