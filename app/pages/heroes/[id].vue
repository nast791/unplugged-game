<template>
  <div
    class="lobby-root bg-app text-ink relative flex h-full min-h-0 flex-col gap-24 overflow-y-auto p-24"
  >
    <header class="flex items-center justify-between gap-16">
      <NuxtLink to="/" class="text-16 text-dim hover:text-ink underline">← В лобби</NuxtLink>
      <span class="text-16 text-dim">Герой сезона</span>
    </header>

    <ALoader v-if="pending" class="flex-1" />

    <p v-else-if="!hero" class="text-18">
      Герой «{{ route.params.id }}» не найден.
      <NuxtLink to="/" class="underline">Вернуться в лобби</NuxtLink>
    </p>

    <HeroDetails v-else :hero="hero" />
  </div>
</template>

<script setup>
/**
 * Страница героя `/heroes/{id}` — то же содержимое, что модалка настройки партии показывает аватаркой:
 * числа бойцов, умение, предметы и тексты карт. Данные отдаёт `/api/content/heroes/{id}`
 * (`server/builders.js: buildHeroSummary`), поэтому новый герой появляется здесь сам, без правок клиента.
 *
 * В партии содержимое открывается **оверлеем** (`HeroSheet`), чтобы не уходить с доски (`docs/ui-plan.md`
 * §5.1); сам текст — общий (`molecules/HeroDetails.vue`), а из лобби ведёт обычная ссылка.
 */
import ALoader from '~/components/atoms/ALoader.vue';
import HeroDetails from '~/components/game/HeroDetails.vue';
import { useHeroQuery } from '~/composables/api/heroes.js';
import { useSeoTitle } from '~/composables/useSeoTitle';

const route = useRoute();
const { data: hero, isPending: pending } = useHeroQuery(() => route.params.id);

useSeoTitle(() => (hero.value ? `Герой: ${hero.value.name}` : 'Герой'));
</script>
