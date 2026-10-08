<template>
  <AModal name="table" title="Общий стол" :error="errorMessage">
    <p class="text-14 text-dim">
      2–4 места: люди и компьютер в любом сочетании, каждый сам за себя. Поле собирает генератор по
      сиду партии.
    </p>

    <p id="setup-order-hint" class="text-14 text-dim">
      Порядок мест — это порядок хода. Место переезжает за ручку
      <Icon
        name="lucide:grip-vertical"
        class="inline size-14 align-text-bottom"
        aria-hidden="true"
      />
      справа или стрелками рядом с ней; вместе с героем едет и управление. Плашка с именем героя
      подсвечивается при наведении и ведёт на его страницу: умение, бойцы и карты.
    </p>

    <div class="flex flex-col gap-8">
      <div
        v-for="(slot, index) in slots"
        :key="slot.id"
        v-bind="targetProps(index)"
        class="rounded-4 flex flex-col gap-12 border-2 px-12 py-8 transition-colors"
        :class="rowClass(index)"
      >
        <div class="relative flex flex-wrap items-center gap-12">
          <span class="text-14 text-dim w-90">{{
            randomPlaces ? 'Место —' : `Место ${index + 1}`
          }}</span>

          <ARadioGroup v-model="slot.control" inline :options="CONTROLS" />

          <AButton
            v-if="canRemoveSlot"
            icon
            variant="ghost"
            class="absolute top-[20%] -right-10 -translate-y-1/2 md:top-[60%] md:right-0"
            aria-label="Убрать место"
            @click="removeSlot(index)"
          >
            <Icon name="lucide:trash-2" class="size-16" aria-hidden="true" />
          </AButton>
        </div>

        <!-- Селект героя — своя строка: в общей он переносился и от этого менял ширину -->
        <div class="flex">
          <ASelect
            v-if="!randomHeroes"
            v-model="slot.heroId"
            class="min-w-200 flex-1"
            :options="heroOptions(index)"
            :aria-label="`Герой места ${index + 1}`"
          />
          <span v-else class="text-14 text-dim min-w-200 flex-1">Случайный герой</span>
        </div>

        <div class="flex flex-wrap items-center gap-12">
          <a
            v-if="!randomHeroes && currentHero(slot.heroId)"
            :href="`/heroes/${slot.heroId}`"
            target="_blank"
            rel="noopener"
            class="group relative block shrink-0"
            :title="`Открыть страницу героя: ${currentHero(slot.heroId).name}`"
            :aria-label="`Открыть страницу героя: ${currentHero(slot.heroId).name}`"
          >
            <AAvatar
              :src="currentHero(slot.heroId).portrait || ''"
              :alt="currentHero(slot.heroId).name"
              :ui="HERO_PLATE"
              :style="{
                '--hero-color': currentHero(slot.heroId).color || 'var(--color-surface-2)',
              }"
            >
              <template #fallback>
                <span
                  class="text-16 text-app group-hover:text-app/70 max-w-full truncate px-8 transition-colors"
                  >{{ currentHero(slot.heroId).name }}</span
                >
              </template>
            </AAvatar>
          </a>

          <div class="ml-auto flex items-center gap-4">
            <AButton
              icon
              variant="ghost"
              class="px-6"
              :disabled="randomPlaces || index === 0"
              :aria-label="`Поднять место ${index + 1} выше`"
              aria-describedby="setup-order-hint"
              @click="moveBy(index, -1)"
            >
              <Icon name="lucide:arrow-up" class="size-16" aria-hidden="true" />
            </AButton>

            <AButton
              icon
              variant="ghost"
              class="px-6"
              :disabled="randomPlaces || index === slots.length - 1"
              :aria-label="`Опустить место ${index + 1} ниже`"
              aria-describedby="setup-order-hint"
              @click="moveBy(index, 1)"
            >
              <Icon name="lucide:arrow-down" class="size-16" aria-hidden="true" />
            </AButton>

            <AButton
              v-bind="handleProps(index)"
              data-sortable-handle
              icon
              variant="ghost"
              tabindex="-1"
              aria-hidden="true"
              :title="randomPlaces ? 'Порядок задаёт сид' : 'Перетащить место'"
              :class="
                randomPlaces
                  ? 'cursor-not-allowed opacity-40'
                  : 'cursor-grab touch-none active:cursor-grabbing'
              "
            >
              <Icon name="lucide:grip-vertical" class="size-16" />
            </AButton>
          </div>
        </div>
      </div>

      <AButton v-if="canAddSlot" variant="ghost" class="self-start" @click="addSlot">
        <Icon name="lucide:plus" class="size-16" aria-hidden="true" />
        Добавить место
      </AButton>
    </div>

    <div class="border-line flex flex-col gap-20 border-t-2 pt-20">
      <div class="flex items-start justify-between gap-16">
        <div class="flex flex-col gap-4">
          <span class="text-16">Случайные герои</span>
          <span class="text-14 text-dim"
            >Раздаются по сиду, выбирать не нужно — как в «Хаосе».</span
          >
        </div>
        <ASwitch v-model="randomHeroes" aria-label="Случайные герои" />
      </div>

      <div class="flex items-start justify-between gap-16">
        <div class="flex flex-col gap-4">
          <span class="text-16">Случайные места</span>
          <span class="text-14 text-dim">Порядок мест тоже определяет сид, а не эта разметка.</span>
        </div>
        <ASwitch v-model="randomPlaces" aria-label="Случайные места" />
      </div>

      <div class="flex items-start justify-between gap-16">
        <div class="flex flex-col gap-4">
          <span class="text-16">Лимит времени на ход</span>
          <span class="text-14 text-dim"
            >Таймер для игры за одним экраном: время подсказывает, что пора передать ход. Ход при
            истечении не заканчивается — решает игрок.</span
          >
        </div>
        <ASelect
          v-model="turnLimit"
          class="w-220"
          :options="TURN_LIMITS"
          aria-label="Лимит времени на ход"
        />
      </div>

      <div class="flex items-start justify-between gap-16">
        <div class="flex flex-col gap-4">
          <span class="text-16">Размер поля</span>
          <span class="text-14 text-dim"
            >«Авто» — генератор выберет сам по сиду (28–38 клеток).</span
          >
        </div>
        <ASelect v-model="cells" class="w-220" :options="CELLS_OPTIONS" aria-label="Размер поля" />
      </div>

      <AInput
        v-model="seedText"
        label="Сид партии"
        numeric
        :maxlength="10"
        placeholder="Случайный"
        hint="Одно и то же число даёт одно и то же поле: сид нужен, чтобы повторить стол или разобрать партию. Пусто — сид выберется сам."
      >
        <template #next="{ focus }">
          <AButton
            icon
            variant="ghost"
            aria-label="Случайный сид"
            title="Случайный сид"
            @click="rollSeed(focus)"
          >
            <Icon name="lucide:dices" class="size-16" aria-hidden="true" />
          </AButton>
        </template>
      </AInput>
    </div>

    <VisuallyHidden aria-live="polite">{{ announcement }}</VisuallyHidden>

    <template #footer>
      <AButton variant="secondary" @click="closeModal('table')">Отмена</AButton>
      <AButton :disabled="!canStart" :loading="pending" @click="start">
        {{ pending ? 'Создание…' : 'Начать' }}
      </AButton>
    </template>
  </AModal>
</template>

<script setup>
/**
 * Модалка настройки **общего стола** — одного режима, а не всех: у каждого режима своя настройка
 * (`docs/ui-plan.md` §4), поэтому и имя у неё по режиму (`table`), а не общее `setup`.
 *
 * Модалка по имени: `openModal('table')`. Внутри — атомы: `ARadioGroup` для управления местом,
 * `ASelect` для героя, поля и переключатели настроек, `AInput` для сида.
 *
 * Место переставляют ручкой (`useSortable`) или стрелками: порядок мест — это `order` в запросе на
 * создание партии, то есть очередь хода и номер стартовой клетки, поэтому перестановка не косметика.
 *
 * «Хаос» (`Случайные герои`, `Случайные места`) считается **по сиду** (`shuffleBySeed`): то же число —
 * тот же стол, и поле, которое соберёт сервер, будет от того же сида.
 *
 * Сообщение о том, почему «Начать» не работает, уходит в футер (проп `error` у `AModal`): в теле окна
 * его сдвигало скроллом.
 */
import { VisuallyHidden } from 'reka-ui';
import { CELLS_LIMIT } from '#shared/helpers/mapGenerator.js';
import { shuffleBySeed } from '#shared/helpers/random.js';
import { useGameView } from '~/composables/useGameView';
import { useSortable } from '~/composables/useSortable';
import { closeModal } from '~/composables/ui/useModal';

const props = defineProps({
  content: { type: Object, default: () => null },
});

const { seed } = useGameView();

const heroes = computed(() => props.content?.heroes ?? []);

/**
 * «Общий стол» — один режим, а не набор пресетов (`docs/ui-plan.md` §3): 2–4 места, каждое человек или
 * компьютер, каждый сам за себя. Пресет `table` в `shared/constants/modes.js` разрешает любое сочетание.
 */
const MODE = 'table';

const CONTROLS = [
  { value: 'human', label: 'Человек' },
  { value: 'ai', label: 'Компьютер' },
];

const TURN_LIMITS = [
  { value: '0', label: 'Без лимита' },
  { value: '30', label: '30 секунд' },
  { value: '60', label: '1 минута' },
  { value: '120', label: '2 минуты' },
  { value: '300', label: '5 минут' },
];

/** Размер поля: «Авто» отдаёт выбор сиду, числа — ручной размер в границах генератора. */
const CELLS_OPTIONS = [
  { value: 'auto', label: 'Авто' },
  ...Array.from({ length: CELLS_LIMIT.max - CELLS_LIMIT.min + 1 }, (_, index) => {
    const cells = CELLS_LIMIT.min + index;
    return { value: String(cells), label: `${cells} клеток` };
  }),
];

const slots = ref([]);
const pending = ref(false);
const error = ref('');
const filled = ref(false);
const announcement = ref('');
const randomHeroes = ref(false);
const randomPlaces = ref(false);
const turnLimit = ref('0');
const cells = ref('auto');
const seedText = ref('');

/** Место — объект с постоянным id: на нём держится перестановка (ключ `v-for` и адрес ручки). */
let slotSeq = 0;
const makeSlot = (control = 'ai', heroId = '') => ({
  id: `slot_${(slotSeq += 1)}`,
  control,
  heroId,
});

const {
  draggingIndex,
  overIndex,
  handleProps,
  targetProps,
  moveBy: reorderBy,
} = useSortable(slots, {
  // `swap`: место — это «кто играет и кем», при перестановке оно меняется целиком, а номера позиций
  // остаются на месте (в режиме `insert` соседей сдвигало бы каскадом).
  mode: 'swap',
  // Случайные места: порядок задаёт сид, переставлять нечего — ручка и стрелки выключены.
  disabled: () => randomPlaces.value,
});

/** Пак героя по id: аватар, его цвет и ссылка на страницу героя. */
const currentHero = id => heroes.value.find(hero => hero.id === id) ?? null;

/**
 * Плашка героя вместо аватара-иконки: она несёт имя, поэтому широкая и низкая. Размер задаётся парой
 * `w`/`h`, а не `size`, — правка `ui` домешивается к пресету через `cn`, где эти группы считаются
 * конфликтующими, поэтому квадрат пресета (`size-36`) она перекрывает сама, без `!`.
 *
 * Подсветка при наведении: плашка светлеет фильтром, а имя — прозрачностью поверх цвета героя (то есть
 * чуть светлеет, но не становится белым: на цветной плашке это выглядит навязчиво). Подчёркивания нет.
 * Пока портрета нет, надпись и есть «аватар»; с артом она уступит место картинке, а подсветка останется.
 */
const HERO_PLATE = {
  avatar_root:
    'h-48 w-192 rounded-md border-transparent bg-[var(--hero-color)] transition-[filter] group-hover:brightness-110',
};

const moveBy = (index, step) => {
  if (randomPlaces.value) return;
  const to = reorderBy(index, step);
  if (to === null) return;
  announcement.value = `Место ${index + 1} заняло место ${to + 1}`;
};

const rowClass = index => {
  if (draggingIndex.value === index) return 'border-accent/60 bg-surface-2';
  if (overIndex.value === index) return 'border-accent bg-surface-2';
  return 'border-line';
};

/** Свободный герой: дубликаты движок не принимает, поэтому раздаём разных по умолчанию. */
const fillHeroes = list => {
  const taken = [];
  return list.map((slot, index) => {
    const free = heroes.value.find(hero => !taken.includes(hero.id));
    const heroId =
      slot.heroId && !taken.includes(slot.heroId)
        ? slot.heroId
        : (free?.id ?? heroes.value[index % (heroes.value.length || 1)]?.id ?? '');
    if (heroId) taken.push(heroId);
    return { ...slot, heroId };
  });
};

/** По умолчанию стол на двоих: человек и компьютер — дальше слоты настраиваются как угодно. */
const resetSlots = () => {
  slots.value = fillHeroes([makeSlot('human'), makeSlot('ai')]);
  error.value = '';
};

/** Контент приходит асинхронно: слоты собираем, как только появились герои. */
watch(
  heroes,
  list => {
    if (!list.length) return;
    if (!filled.value) {
      filled.value = true;
      resetSlots();
      return;
    }
    slots.value = fillHeroes(slots.value);
  },
  { immediate: true },
);

const usedElsewhere = index => slots.value.filter((_, i) => i !== index).map(slot => slot.heroId);

/** Варианты героя для места: занятые другими местами показываем недоступными, а не прячем. */
const heroOptions = index =>
  heroes.value.map(hero => ({
    value: hero.id,
    label: `${hero.name}${hero.health ? ` · ${hero.health} hp` : ''}`,
    disabled: usedElsewhere(index).includes(hero.id),
  }));

const humansCount = computed(() => slots.value.filter(slot => slot.control === 'human').length);
const canAddSlot = computed(() => slots.value.length < 4);
const canRemoveSlot = computed(() => slots.value.length > 2);

const addSlot = () => {
  if (!canAddSlot.value) return;
  slots.value = fillHeroes([...slots.value, makeSlot('ai')]);
};

const removeSlot = index => {
  if (!canRemoveSlot.value) return;
  slots.value = fillHeroes(slots.value.filter((_, i) => i !== index));
};

const canStart = computed(
  () =>
    slots.value.length >= 2 &&
    humansCount.value >= 1 &&
    // С раздачей героев выбирать нечего: уникальность и заполненность обеспечены сидом.
    (randomHeroes.value || slots.value.every(slot => slot.heroId)),
);

/** Причина, по которой «Начать» выключена, либо ошибка сервера: показывается в футере. */
const errorMessage = computed(() => {
  if (!humansCount.value) return 'Нужен хотя бы один человек за столом.';
  if (!randomHeroes.value && slots.value.some(slot => !slot.heroId)) {
    return 'У каждого места должен быть герой.';
  }
  return error.value;
});

const randomSeed = () => Math.floor(Math.random() * 0x100000000);

/** Кнопка «кубик»: сид видно в поле — его можно запомнить или передать другому. */
const rollSeed = focus => {
  seedText.value = String(randomSeed());
  focus?.();
};

/** Сид партии: число из поля, а если поля нет — своё случайное (тогда оно же уходит в «Хаос»). */
const seedValue = () => {
  const value = Number(seedText.value);
  return seedText.value !== '' && Number.isInteger(value) ? value : randomSeed();
};

/** Раздача героев по сиду: тот же стол — те же герои на тех же местах. */
const dealHeroes = (list, seedNumber) => {
  const pool = shuffleBySeed(
    heroes.value.map(hero => hero.id),
    seedNumber + 1,
  );
  if (!pool.length) return list;
  return list.map((slot, index) => ({ ...slot, heroId: pool[index % pool.length] }));
};

const start = async () => {
  if (!canStart.value || pending.value) return;
  pending.value = true;
  error.value = '';
  try {
    const seedNumber = seedValue();
    seedText.value = String(seedNumber);
    const ordered = randomPlaces.value ? shuffleBySeed(slots.value, seedNumber) : slots.value;
    const placed = randomHeroes.value ? dealHeroes(ordered, seedNumber) : ordered;
    const chosen = placed.find(slot => slot.control === 'human') ?? placed[0];

    const body = {
      mapId: 'generated',
      mode: MODE,
      seed: seedNumber,
      cells: cells.value === 'auto' ? undefined : Number(cells.value),
      turnLimit: Number(turnLimit.value) || 0,
      // FFA: у каждого места своя команда, порядок хода — по номеру места
      heroes: placed.map((slot, index) => ({
        heroId: slot.heroId,
        team: String.fromCharCode(65 + index),
        order: index + 1,
        control: slot.control,
      })),
      playerId: chosen.heroId,
    };
    const res = await $fetch('/api/game/create', { method: 'POST', body });
    seed(res.host, body.playerId);
    closeModal('table');
    await navigateTo({ path: '/game', query: { gameId: res.id, playerId: body.playerId } });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    pending.value = false;
  }
};
</script>
