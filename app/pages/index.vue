<template>
  <main class="flex flex-1 flex-col items-center justify-center gap-6 p-8">
    <div class="flex flex-col items-center gap-2 text-center">
      <h1 class="text-32 font-semibold tracking-tight">UnPlugged</h1>
      <p class="text-16 opacity-60">Лобби — контент из shared/content</p>
    </div>

    <section class="flex w-full max-w-140 flex-col gap-4 text-16">
      <div class="flex flex-col gap-3 border border-primary/15 p-4">
        <p class="font-medium">Карта</p>
        <p class="opacity-70">
          {{ mapMeta.name }}
          <code class="opacity-50">({{ mapMeta.id }})</code>
          · {{ mapMeta.nodeCount }} узлов
        </p>
      </div>

      <div class="flex flex-col gap-3 border border-primary/15 p-4">
        <p class="font-medium">Слоты</p>
        <ul class="flex flex-col gap-3">
          <li
            v-for="player in players"
            :key="player.id"
            class="flex flex-col gap-1 border border-primary/10 p-3"
          >
            <p>
              Игрок {{ player.id }} · team {{ player.team }} ·
              <span :style="{ color: player.color }">{{ player.name }}</span>
            </p>
            <p class="text-14 opacity-70">
              fighters:
              {{
                (player.fighters || [])
                  .map((f) => `${f.name}(${f.type}, hp=${f.hp})`)
                  .join(', ')
              }}
            </p>
            <p class="text-14 opacity-70">
              deck: {{ player.deck?.length ?? 0 }} карт · hand будет разобрана
              engine (handSize={{ rules.handSize }})
            </p>
          </li>
        </ul>
      </div>

      <label class="flex flex-col gap-2">
        <span class="opacity-70">Играть за</span>
        <select
          v-model="asPlayerId"
          class="border border-primary/20 bg-white px-3 py-2"
        >
          <option v-for="player in players" :key="player.id" :value="player.id">
            Игрок {{ player.id }} — {{ player.name }}
          </option>
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
    </section>
  </main>
</template>

<script setup>
import { buildDefaultLobbySetup } from '#shared/content/buildSetup.js';

const game = useGameSetup();
const seats = usePlayerSetup();
const { createFromSetup } = useGameView();

const asPlayerId = ref('0');
const pending = ref(false);
const error = ref('');

const players = computed(() => seats.players.value);
const rules = computed(() => game.rules.value);
const mapMeta = computed(() => {
  const map = game.map.value;
  if (!map || typeof map !== 'object') {
    return { id: '—', name: '—', nodeCount: 0 };
  }
  return {
    id: map.id ?? '—',
    name: map.name ?? '—',
    nodeCount: Array.isArray(map.nodes) ? map.nodes.length : 0,
  };
});
const canStart = computed(() => game.isReady() && seats.isReady());

const ensureLobbySetup = () => {
  const setup = buildDefaultLobbySetup();
  game.reset();
  seats.reset();
  game.setMap(setup.map);
  for (const seat of setup.seats) {
    seats.add(seat);
  }
  asPlayerId.value = String(game.rules.value.startingPlayer ?? '0');
};

onMounted(() => {
  ensureLobbySetup();
});

const onStart = async () => {
  error.value = '';
  pending.value = true;
  try {
    await createFromSetup(asPlayerId.value);
    await navigateTo('/game');
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    pending.value = false;
  }
};
</script>
