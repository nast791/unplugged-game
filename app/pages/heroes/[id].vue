<template>
  <div class="lobby-root bg-app text-ink relative flex min-h-dvh flex-col gap-24 p-24">
    <header class="flex items-center justify-between gap-16">
      <NuxtLink to="/" class="text-16 text-dim hover:text-ink underline">← В лобби</NuxtLink>
      <span class="text-14 text-dim">Герой сезона</span>
    </header>

    <ALoader v-if="pending" class="flex-1" />

    <p v-else-if="!hero" class="text-18">
      Герой «{{ route.params.id }}» не найден.
      <NuxtLink to="/" class="underline">Вернуться в лобби</NuxtLink>
    </p>

    <article v-else class="flex flex-col gap-24">
      <section class="flex flex-wrap items-center gap-16">
        <AAvatar
          :src="hero.portrait || ''"
          :alt="hero.name"
          :ui="{
            avatar_root: 'size-72 border-transparent bg-[var(--hero-color)]',
            avatar_icon: 'size-36',
            avatar_fallback: 'text-24 text-app',
          }"
          :style="{ '--hero-color': hero.color || 'var(--color-surface-2)' }"
        />

        <div class="flex flex-col gap-4">
          <h1 class="text-40 font-semibold">{{ hero.name }}</h1>
          <p class="text-14 text-dim">
            {{ healthLine }} · {{ hero.deckSize }} карт в колоде
            <template v-if="hero.terrainAffinity.length">
              · стихии: {{ hero.terrainAffinity.map(terrainLabel).join(', ') }}
            </template>
          </p>
        </div>
      </section>

      <section v-if="hero.skill" class="border-line rounded-6 flex flex-col gap-8 border-2 p-20">
        <h2 class="text-22 font-semibold">{{ hero.skill.title }}</h2>
        <p class="text-16 leading-[1.4]">{{ hero.skill.text }}</p>
      </section>

      <section class="flex flex-col gap-12">
        <h2 class="text-22 font-semibold">Бойцы</h2>
        <div class="flex flex-wrap gap-12">
          <div
            v-for="fighter in hero.fighters"
            :key="`${fighter.type}-${fighter.id}`"
            class="border-line rounded-4 flex min-w-220 flex-col gap-4 border-2 px-16 py-12"
          >
            <span class="text-16">{{ fighter.name }}</span>
            <span class="text-14 text-dim">
              {{ fighter.type === 'hero' ? 'герой' : 'помощник'
              }}<template v-if="fighter.count > 1"> ×{{ fighter.count }}</template> ·
              {{ fighter.hp }} hp · шаг {{ fighter.move }} · удар {{ fighter.attackRange }}
            </span>
          </div>
        </div>
      </section>

      <section v-if="hero.items.length" class="flex flex-col gap-12">
        <h2 class="text-22 font-semibold">Предметы</h2>
        <div class="flex flex-wrap gap-12">
          <div
            v-for="item in hero.items"
            :key="item.id"
            class="border-line rounded-4 flex min-w-260 flex-col gap-4 border-2 px-16 py-12"
          >
            <span class="text-16"
              >{{ item.name }}<template v-if="item.count > 1"> ×{{ item.count }}</template></span
            >
            <span v-if="item.condition" class="text-14 text-dim">{{ item.condition }}</span>
            <span v-if="item.states" class="text-14 text-dim">
              состояния: {{ Object.values(item.states).join(' · ') }}
            </span>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-12">
        <h2 class="text-22 font-semibold">Карты</h2>
        <ul class="flex flex-col gap-8">
          <li
            v-for="card in hero.cards"
            :key="card.id"
            class="border-line rounded-4 flex flex-wrap items-baseline gap-12 border-2 px-16 py-12"
          >
            <span class="text-16 min-w-220">{{ card.name }}</span>
            <span class="text-14 text-dim w-140">{{ typeLabel(card.type) }}</span>
            <span class="text-14 text-dim w-140"
              >значение {{ card.value }} · бонус {{ card.bonus }}</span
            >
            <span class="text-14 text-dim w-60">×{{ card.quantity }}</span>
            <span class="text-16 min-w-320 flex-1 leading-[1.4]">{{ card.text }}</span>
            <span v-if="card.fighter" class="text-14 text-dim">{{
              fighterName(card.fighter)
            }}</span>
          </li>
        </ul>
      </section>
    </article>
  </div>
</template>

<script setup>
/**
 * Страница героя `/heroes/{id}` — то же содержимое, что модалка настройки партии показывает аватаркой:
 * числа бойцов, умение, предметы и тексты карт. Данные отдаёт `/api/content/heroes/{id}`
 * (`server/builders.js: buildHeroSummary`), поэтому новый герой появляется здесь сам, без правок клиента.
 *
 * В партии содержимое открывается **оверлеем**, чтобы не уходить с доски (`docs/ui-plan.md` §5.1);
 * из лобби ведёт обычная ссылка (в новой вкладке — настройка партии не теряется).
 */
import { terrainName } from '#shared/constants/terrain.js';
import { useSeoTitle } from '~/composables/useSeoTitle';

const route = useRoute();
const { data: hero, pending } = await useFetch(`/api/content/heroes/${route.params.id}`);

const healthLine = computed(() => {
  const heroFighter = hero.value?.fighters.find(fighter => fighter.type === 'hero');
  return heroFighter ? `${heroFighter.hp} hp` : 'герой без числа здоровья';
});

const CARD_TYPES = { attack: 'атака', defense: 'защита', hybrid: 'атака/защита', effect: 'эффект' };
const typeLabel = type => CARD_TYPES[type] ?? type;
const terrainLabel = terrain => terrainName(terrain);
const fighterName = id => hero.value?.fighters.find(fighter => fighter.id === id)?.name ?? id;

useSeoTitle(() => (hero.value ? `Герой: ${hero.value.name}` : 'Герой'));
</script>
