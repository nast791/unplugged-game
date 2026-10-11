<template>
  <article class="flex min-h-0 flex-col gap-16 lg:flex-row">
    <!-- Левая колонка — герой лицом: большой арт (пока заглушка в цвете героя), имя, бойцы и предметы. -->
    <section class="flex w-full shrink-0 flex-col gap-12 lg:w-520">
      <div
        class="border-line rounded-6 relative flex min-h-240 flex-1 items-center justify-center overflow-hidden border-2"
        :style="{ '--hero-color': hero.color || 'var(--color-surface-2)' }"
      >
        <!-- Портрет появится артом (`public/art/heroes/{id}/portrait.webp`): до него — знак героя. -->
        <span class="absolute inset-0 bg-[var(--hero-color)]/20" />
        <Icon
          :name="heroFace"
          class="size-160 text-[var(--hero-color)] opacity-90"
          aria-hidden="true"
        />
      </div>

      <div class="flex flex-col gap-4">
        <h1 class="text-28 font-semibold">{{ hero.name }}</h1>
        <p class="text-16 text-dim">
          {{ healthLine }}
          <template v-if="hero.terrainAffinity.length">
            · стихии: {{ hero.terrainAffinity.map(terrainLabel).join(', ') }}
          </template>
        </p>
      </div>

      <div class="flex flex-wrap gap-8">
        <span
          v-for="fighter in hero.fighters"
          :key="`${fighter.type}-${fighter.id}`"
          class="border-line rounded-4 flex items-center gap-8 border-2 px-12 py-8"
        >
          <Icon :name="faceOfFighter(fighter)" class="text-dim size-18" aria-hidden="true" />
          <span class="flex flex-col gap-2">
            <span class="text-16">
              {{ fighter.name }}<template v-if="fighter.count > 1"> ×{{ fighter.count }}</template>
            </span>
            <span class="text-16 text-dim lining-nums">
              {{ fighter.hp }} hp · шаг {{ fighter.move }} · удар {{ fighter.attackRange }}
            </span>
          </span>
        </span>
      </div>

      <div v-if="hero.items.length" class="flex flex-wrap gap-8">
        <span
          v-for="item in hero.items"
          :key="item.id"
          class="border-line rounded-4 flex items-center gap-8 border-2 px-12 py-8"
          :title="item.condition"
        >
          <Icon :name="item.icon || 'lucide:shield'" class="text-dim size-18" aria-hidden="true" />
          <span class="text-16"
            >{{ item.name }}<template v-if="item.count > 1"> ×{{ item.count }}</template></span
          >
        </span>
      </div>
    </section>

    <!-- Правая колонка — подробности: умение, предметы словами и тексты карт в две колонки. -->
    <section class="flex min-h-0 flex-1 flex-col gap-16 lg:overflow-y-auto lg:pr-8">
      <section v-if="hero.skill" class="border-line rounded-6 flex flex-col gap-8 border-2 p-16">
        <h2 class="text-18 font-semibold">{{ hero.skill.title }}</h2>
        <p class="text-16 leading-[1.4]">{{ hero.skill.text }}</p>
      </section>

      <section v-if="hero.items.length" class="flex flex-col gap-8">
        <h2 class="text-18 font-semibold">Предметы</h2>
        <p v-for="item in hero.items" :key="`item-${item.id}`" class="text-16 text-dim">
          <span class="text-ink">{{ item.name }}</span>
          <template v-if="item.count > 1"> ×{{ item.count }}</template>
          <template v-if="item.states"> · {{ Object.values(item.states).join(' / ') }}</template>
          <template v-if="item.condition"> · {{ item.condition }}</template>
        </p>
      </section>

      <section class="flex flex-col gap-8">
        <h2 class="text-18 font-semibold">Карты</h2>
        <div class="grid gap-8 xl:grid-cols-2">
          <article
            v-for="card in hero.cards"
            :key="card.id"
            class="border-line rounded-4 flex flex-col gap-4 border-2 px-12 py-8"
          >
            <span class="flex items-baseline gap-8">
              <span class="text-18 font-medium">{{ card.name }}</span>
              <span class="text-16 text-dim">{{ typeLabel(card.type) }}</span>
              <span class="text-16 text-dim ml-auto lining-nums">
                {{ card.value }}<template v-if="card.bonus"> ·+{{ card.bonus }}</template> · ×{{
                  card.quantity
                }}
              </span>
            </span>
            <span class="text-16 text-dim leading-[1.4]">{{ card.text }}</span>
            <span v-if="card.fighter" class="text-16 text-dim">{{
              fighterName(card.fighter)
            }}</span>
          </article>
        </div>
      </section>
    </section>
  </article>
</template>

<script setup>
import { terrainName } from '#shared/constants/terrain.js';
import { fighterFace } from '~/utils/game/fighterFaces.js';

/**
 * Содержимое карточки героя: герой лицом (большой арт, имя, бойцы, предметы) и подробности справа —
 * умение, предметы словами и тексты карт. Данные приходят пропом, запрос делает вызывающий: страница
 * `/heroes/{id}` берёт героя из маршрута, партия — из клика по карточке места, поэтому рисовать это
 * дважды незачем.
 *
 * Раскладка рассчитана на **модалку во весь экран** (`organisms/modals/HeroSheet.vue`): на десктопе
 * обе колонки видны целиком, без скролла; на узком экране колонки складываются, и прокручивается
 * только правая часть.
 */
const props = defineProps({
  /** Ответ `/api/content/heroes/{id}`: `name`, `color`, `skill`, `fighters`, `items`, `cards`. */
  hero: { type: Object, required: true },
});

const healthLine = computed(() => {
  const heroFighter = props.hero.fighters.find(fighter => fighter.type === 'hero');
  return heroFighter ? `${heroFighter.hp} hp` : 'герой без числа здоровья';
});

/**
 * Значок бойца — показ (портретов пока нет): словарь моков в `app/utils/game/fighterFaces.js`.
 * Значок предмета — **контент**: он объявлен в паке героя (`item.icon`) и берётся прямо из данных.
 */
const heroFace = computed(() => fighterFace({ id: props.hero.id }));
const faceOfFighter = fighter => fighterFace(fighter);

const CARD_TYPES = { attack: 'атака', defense: 'защита', hybrid: 'атака/защита', effect: 'эффект' };
const typeLabel = type => CARD_TYPES[type] ?? type;
const terrainLabel = terrain => terrainName(terrain);
const fighterName = id => props.hero.fighters.find(fighter => fighter.id === id)?.name ?? id;
</script>
