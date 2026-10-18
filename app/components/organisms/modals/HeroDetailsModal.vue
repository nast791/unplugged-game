<template>
  <div
    v-if="heroId"
    ref="root"
    class="bg-app/85 backdrop-blur-8 fixed inset-0 z-40 flex items-center justify-center p-16"
    tabindex="-1"
    @click="close"
    @keydown="onKeydown"
  >
    <section
      class="border-line rounded-6 bg-surface text-ink flex h-[92dvh] w-[92dvw] max-w-1600 flex-col overflow-hidden border-2 shadow-2xl"
      role="dialog"
      aria-modal="true"
      :aria-label="heroName"
      @click.stop
    >
      <header class="border-line flex items-center justify-between gap-16 border-b-2 px-24 py-12">
        <span class="text-22 font-semibold tracking-[0.02em] uppercase">{{ heroName }}</span>
        <AButton
          variant="ghost"
          icon
          class="-mt-4"
          aria-label="Закрыть карточку героя"
          @click="close"
        >
          <Icon name="lucide:x" class="size-44" aria-hidden="true" />
        </AButton>
      </header>

      <div class="min-h-0 flex-1">
        <ALoader v-if="pending" class="h-full" />

        <p v-else-if="error" class="text-16 text-danger p-24">
          Карточка героя не загрузилась — партия идёт дальше, попробуйте открыть ещё раз.
        </p>

        <HeroDetails v-else-if="hero" :hero="hero" class="h-full" />
      </div>
    </section>
  </div>
</template>

<script setup>
import AButton from '~/components/atoms/AButton.vue';
import ALoader from '~/components/atoms/ALoader.vue';
import HeroDetails from '~/components/game/HeroDetails.vue';
import { useHeroQuery } from '~/composables/api/heroes.js';
import { closeModal, useModalPayload } from '~/composables/ui/useModal.js';

const heroId = useModalPayload('heroDetails');

const root = ref(null);
const {
  data: hero,
  isPending: pending,
  isError: error,
} = useHeroQuery(() => String(heroId.value ?? ''));

const heroName = computed(() => hero.value?.name || String(heroId.value ?? ''));

const close = () => closeModal('heroDetails');

watch(heroId, async id => {
  if (!id) return;
  await nextTick();
  root.value?.focus?.();
});

onBeforeUnmount(() => closeModal('heroDetails'));

const onKeydown = event => {
  if (event.key === 'Escape') close();
};
</script>
