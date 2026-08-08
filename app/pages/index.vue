<template>
  <main class="flex flex-1 flex-col items-center justify-center gap-6 p-8">
    <div class="flex flex-col items-center gap-2 text-center">
      <h1 class="text-32 font-semibold tracking-tight">UnPlugged</h1>
      <p class="text-16 opacity-60">Лобби</p>
    </div>

    <section class="flex w-full max-w-140 flex-col gap-4 text-16">
      <div class="flex flex-col gap-3 border border-primary/15 p-4">
        <p class="font-medium">Карта</p>
        <p class="opacity-70">
          {{ setup.mapId }}
        </p>
      </div>

      <div class="flex flex-col gap-3 border border-primary/15 p-4">
        <p class="font-medium">Герои</p>
        <ul class="flex flex-col gap-2">
          <li
            v-for="h in setup.heroes"
            :key="h.heroId"
            class="border border-primary/10 p-3"
          >
            {{ h.heroId }} · team {{ h.team }} · order {{ h.order }} ·
            {{ h.control }}
          </li>
        </ul>
      </div>

      <label class="flex flex-col gap-2">
        <span class="opacity-70">Играть за</span>
        <select
          v-model="asHeroId"
          class="border border-primary/20 bg-white px-3 py-2"
        >
          <option
            v-for="h in humanHeroes"
            :key="h.heroId"
            :value="h.heroId"
          >
            {{ h.heroId }}
          </option>
        </select>
      </label>

      <p v-if="error" class="text-14 text-red-600">{{ error }}</p>

      <button
        type="button"
        class="bg-primary px-4 py-3 text-white disabled:opacity-40"
        :disabled="pending"
        @click="onStart"
      >
        {{ pending ? 'Создание…' : 'Начать' }}
      </button>
    </section>
  </main>
</template>

<script setup>
const setup = {
  mapId: 'arena',
  mode: 'vs_ai',
  heroes: [
    { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
    { heroId: 'beta', team: 'B', order: 2, control: 'ai' },
  ],
};

const asHeroId = ref('medusa');
const pending = ref(false);
const error = ref('');

const humanHeroes = computed(() =>
  setup.heroes.filter(h => h.control === 'human'),
);

const onStart = async () => {
  error.value = '';
  pending.value = true;
  try {
    const game = await $fetch('/api/game/create', {
      method: 'POST',
      body: setup,
    });
    await navigateTo({
      path: '/game',
      query: { gameId: game.id, playerId: asHeroId.value },
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    pending.value = false;
  }
};
</script>
