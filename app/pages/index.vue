<template>
  <main class="flex flex-1 flex-col items-center justify-center gap-6 p-8">
    <div class="flex flex-col items-center gap-2 text-center">
      <h1 class="text-32 font-semibold tracking-tight">UnPlugged</h1>
      <p class="text-16 opacity-60">Лобби</p>
    </div>

    <section class="flex w-full max-w-140 flex-col gap-4 text-16">
      <p v-if="setupError" class="border border-red-300 bg-red-50 p-3 text-14 text-red-700">
        {{ setupError }}
      </p>

      <label class="flex flex-col gap-2">
        <span class="opacity-70">Карта</span>
        <select v-model="mapId" class="border border-primary/20 bg-white px-3 py-2">
          <option v-for="map in maps" :key="map.id" :value="map.id">
            {{ map.name }}
          </option>
        </select>
      </label>

      <div class="flex flex-col gap-3 border border-primary/15 p-4">
        <p class="font-medium">Игроки (hotseat: играем и за первого, и за второго)</p>
        <label class="flex flex-col gap-2">
          <span class="opacity-70">Первый игрок</span>
          <select v-model="heroA" class="border border-primary/20 bg-white px-3 py-2">
            <option v-for="hero in heroes" :key="hero.id" :value="hero.id">
              {{ hero.name }} · {{ hero.health }} hp · бойцов {{ hero.fighters }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-2">
          <span class="opacity-70">Второй игрок</span>
          <select v-model="heroB" class="border border-primary/20 bg-white px-3 py-2">
            <option v-for="hero in heroes" :key="hero.id" :value="hero.id">
              {{ hero.name }} · {{ hero.health }} hp · бойцов {{ hero.fighters }}
            </option>
          </select>
        </label>
        <p v-if="heroA === heroB" class="text-12 text-red-600">
          Герои должны быть разными.
        </p>
      </div>

      <label class="flex flex-col gap-2">
        <span class="opacity-70">Смотреть глазами</span>
        <select v-model="asHeroId" class="border border-primary/20 bg-white px-3 py-2">
          <option :value="heroA">{{ heroName(heroA) }}</option>
          <option :value="heroB">{{ heroName(heroB) }}</option>
        </select>
      </label>

      <p v-if="error" class="text-14 text-red-600">{{ error }}</p>

      <button
        type="button"
        class="bg-primary px-4 py-3 text-white disabled:opacity-40"
        :disabled="pending || !canStart"
        @click="onStart"
      >
        {{ pending ? 'Создание…' : 'Начать' }}
      </button>

      <p class="text-12 opacity-60">
        Пока доступен только hotseat на двоих: ИИ и другие режимы — в TODO. Внутри партии смотреть
        глазами игроков можно кнопками в панели «Hotseat».
      </p>
    </section>
  </main>
</template>

<script setup>
const { data: content } = await useFetch('/api/content/setup');

const maps = computed(() => content.value?.maps ?? []);
const heroes = computed(() => content.value?.heroes ?? []);
const setupError = computed(() => (content.value ? '' : 'Не удалось загрузить контент'));

const mapId = ref('');
const heroA = ref('');
const heroB = ref('');
const asHeroId = ref('');
const pending = ref(false);
const error = ref('');

watch(
  [maps, heroes],
  () => {
    if (!mapId.value) mapId.value = maps.value[0]?.id ?? '';
    if (!heroA.value) heroA.value = heroes.value[0]?.id ?? '';
    if (!heroB.value) {
      heroB.value = heroes.value.find(hero => hero.id !== heroA.value)?.id ?? '';
    }
    asHeroId.value = heroA.value;
  },
  { immediate: true },
);

const heroName = id =>
  heroes.value.find(hero => hero.id === id)?.name ?? String(id ?? '');

const canStart = computed(
  () => Boolean(mapId.value) && Boolean(heroA.value) && heroA.value !== heroB.value,
);

const { seed } = useGameView();

const onStart = async () => {
  error.value = '';
  if (!canStart.value) {
    error.value = 'Выберите карту и двух разных героев';
    return;
  }
  pending.value = true;
  try {
    const body = {
      mapId: mapId.value,
      // hotseat: оба слота играет человек, поэтому control — human у обоих
      mode: 'hotseat',
      heroes: [
        { heroId: heroA.value, team: 'A', order: 1, control: 'human' },
        { heroId: heroB.value, team: 'B', order: 2, control: 'human' },
      ],
      playerId: asHeroId.value || heroA.value,
    };
    const res = await $fetch('/api/game/create', { method: 'POST', body });
    seed(res.host, body.playerId);
    await navigateTo({
      path: '/game',
      query: { gameId: res.id, playerId: body.playerId },
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    pending.value = false;
  }
};
</script>
