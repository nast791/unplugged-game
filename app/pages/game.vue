<template>
  <main class="flex flex-1 flex-col gap-4 p-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <h1 class="text-28 font-semibold tracking-tight">Партия</h1>
        <p class="text-14 opacity-60">
          gameId: <code>{{ gameId ?? '—' }}</code>
          · map: {{ mapSummary }}
        </p>
      </div>
      <NuxtLink to="/" class="text-16 underline opacity-70 hover:opacity-100">
        В лобби
      </NuxtLink>
    </header>

    <p
      v-if="hint"
      class="border border-primary/20 bg-primary/5 px-4 py-3 text-16"
    >
      {{ hint }}
    </p>

    <section class="grid gap-2 border border-primary/15 p-3 text-14 sm:grid-cols-3">
      <p>
        phase: <strong>{{ phase ?? '—' }}</strong>
        <span v-if="isPlacement" class="opacity-60"> · расстановка</span>
      </p>
      <p>turn: <strong>{{ turn }}</strong></p>
      <p>current: <strong>{{ currentPlayerId ?? '—' }}</strong></p>
      <p>AP: <strong>{{ actionsLeft }}</strong></p>
      <p>you: <strong>{{ you ?? '—' }}</strong></p>
      <p>
        isMyTurn:
        <strong :class="isMyTurn ? 'text-green-700' : 'opacity-50'">{{ isMyTurn }}</strong>
      </p>
      <p v-if="targeting" class="sm:col-span-3 text-emerald-900">
        выбор цели: {{ targeting.candidates?.length ?? 0 }} кандидат(ов)
      </p>
      <p v-if="movement" class="sm:col-span-3 text-sky-800">
        перемещение открыто
        <template v-if="movement.bonus"> · усиление +{{ movement.bonus }}</template>
      </p>
      <p v-if="combat" class="sm:col-span-3 text-amber-800">
        бой: {{ combat.stage }}
        <template v-if="combat.targetFighterId">
          · цель {{ combat.targetFighterId }}
        </template>
        <template v-if="combat.defenderPlayerId">
          · защищается {{ combat.defenderPlayerId }}
        </template>
      </p>
      <p v-if="lastCombat" class="sm:col-span-3 text-emerald-800">
        прошлый бой: {{ lastCombat.attackValue }} vs {{ lastCombat.defenseValue }} →
        урон {{ lastCombat.combatDamage }} · победил
        {{ lastCombat.winner === 'attacker' ? 'атакующий' : 'защитник' }}
        ({{ lastCombat.winnerPlayerId }})
      </p>
      <p v-if="isGameOver" class="sm:col-span-3">
        gameEnd · победа:
        <strong>{{ results?.winnerName ?? winner ?? '—' }}</strong>
      </p>
    </section>

    <div class="grid flex-1 gap-4 lg:grid-cols-[280px_1fr]">
      <aside class="flex flex-col gap-3">
        <section class="flex flex-col gap-2 border border-primary/15 p-3">
          <p class="text-14 font-medium">Hotseat</p>
          <p class="text-12 opacity-60">
            смотрите глазами:
            <strong>{{ me?.name || you }}</strong>
            <template v-if="!isPlacement && currentPlayer">
              · ходит:
              <strong>{{ currentPlayer.name || currentPlayerId }}</strong>
            </template>
          </p>
          <button
            v-for="player in players"
            :key="player.id"
            type="button"
            class="border border-primary/20 px-3 py-2 text-left text-14 disabled:opacity-40"
            :class="String(you) === String(player.id) ? 'bg-primary text-white' : ''"
            :disabled="pending || String(you) === String(player.id)"
            @click="onSwitchPlayer(player.id)"
          >
            {{ player.name || player.id }}
            <span v-if="String(currentPlayerId) === String(player.id)" class="opacity-70">
              · ход
            </span>
            <span v-if="player.resigned" class="opacity-70"> · сдался</span>
          </button>
        </section>

        <section
          v-if="!isGameOver"
          class="flex flex-col gap-2 border border-primary/15 p-3"
        >
          <p class="text-14 font-medium">Действия</p>
          <button
            type="button"
            class="border border-primary/20 px-3 py-2 text-left text-14 disabled:opacity-40"
            :disabled="pending || isGameOver || !deckClickable"
            @click="onDeckClick"
          >
            Колода ({{ deckCount }})
          </button>
          <button
            v-if="okControl.visible"
            type="button"
            class="bg-primary px-3 py-2 text-14 text-white disabled:opacity-40"
            :disabled="pending || isGameOver || !okControl.enabled"
            @click="onFinishAction"
          >
            <template v-if="isPlacement && !okControl.enabled">Ожидание…</template>
            <template v-else>{{ okControl.label || 'ОК' }}</template>
          </button>
          <button
            v-if="backControl.visible"
            type="button"
            class="border border-primary px-3 py-2 text-14 disabled:opacity-40"
            :disabled="pending || isGameOver || !backControl.enabled"
            @click="onUiBack"
          >
            {{ backControl.label || 'Назад' }}
          </button>
          <button
            v-if="!isGameOver"
            type="button"
            class="border border-primary px-3 py-2 text-14 disabled:opacity-40"
            :disabled="pending"
            @click="onResign"
          >
            Сдаться
          </button>
          <p class="text-12 opacity-60">
            действие объявляется кликом: колода — перемещение, карта атаки — бой.
          </p>
        </section>

        <section class="flex flex-col gap-2 border border-primary/15 p-3">
          <p class="text-14 font-medium">Бойцы</p>
          <p v-if="isPlacement" class="text-12 opacity-60">
            <template v-if="placementPhase === 'pickNumHero'">
              Выберите героя для номерной клетки.
            </template>
            <template v-else>
              Расставьте всех бойцов в своей зоне, затем нажмите «ОК».
            </template>
          </p>
          <ul v-if="isPlacement" class="flex flex-col gap-1 text-12 opacity-70">
            <li v-for="player in players" :key="`ready-${player.id}`">
              {{ player.name || player.id }}:
              {{ player.placementReady ? 'подтвердил' : 'расставляет…' }}
            </li>
          </ul>
          <button
            v-for="fighter in myFighters"
            :key="fighter.id"
            type="button"
            class="border border-primary/20 px-3 py-2 text-left text-14"
            :class="
              String(selectedFighterId) === String(fighter.id)
                ? 'bg-primary text-white'
                : 'bg-white'
            "
            @click="onFighterClick({ fighterId: fighter.id })"
          >
            {{ fighter.name || fighter.id }}
            <span class="opacity-70">
              · {{ fighter.type }}
              · hp {{ fighter.currentHp }}/{{ fighter.startHp }}
              ·
              {{
                fighter.currentPosition == null ? 'не на доске' : `кл. ${fighter.currentPosition}`
              }}
            </span>
          </button>
        </section>

        <section
          v-if="isGameOver"
          class="flex flex-col gap-2 border border-primary/15 p-3"
        >
          <p class="text-14 font-medium">Итоги партии</p>
          <p class="text-16">
            Победа: <strong>{{ results?.winnerName ?? '—' }}</strong>
          </p>
          <p class="text-12 opacity-70">
            раундов: {{ results?.round ?? '—' }} · ходов: {{ results?.turn ?? '—' }}
          </p>
          <ul class="flex flex-col gap-1 text-12">
            <li v-for="entry in results?.players ?? []" :key="`res-${entry.id}`">
              <strong>{{ entry.name }}</strong>
              <span v-if="entry.resigned" class="opacity-70"> · сдался</span>
              <span class="opacity-80">
                ·
                {{
                  entry.fighters.length
                    ? entry.fighters
                        .map(
                          fighter =>
                            `${fighter.name} ${fighter.hp}${fighter.maxHp ? '/' + fighter.maxHp : ''}`,
                        )
                        .join(', ')
                    : 'бойцов не осталось'
                }}
              </span>
            </li>
          </ul>
          <button
            type="button"
            class="bg-primary px-3 py-2 text-14 text-white"
            @click="onBackToMenu"
          >
            В меню
          </button>
        </section>

        <section
          v-if="!isPlacement && !isGameOver"
          class="flex flex-col gap-2 border border-primary/15 p-3"
        >
          <p class="text-14 font-medium">Hand ({{ myHand.length }})</p>
          <button
            v-for="card in myHand"
            :key="card.instanceId || card.id"
            type="button"
            class="border border-primary/20 px-2 py-1.5 text-left text-12 disabled:opacity-40"
            :class="isCardPlayable(card) ? 'bg-white' : 'bg-zinc-100'"
            :disabled="pending || isGameOver || !isCardPlayable(card)"
            @click="onCardClick(card)"
          >
            <span class="font-medium">{{ card.title || card.id }}</span>
            <span class="opacity-70">
              · {{ card.type }}{{ card.value != null ? ` ${card.value}` : '' }}
              <template v-if="card.bonus != null">
                · бон.{{ card.bonus }}
              </template>
            </span>
            <span class="mt-0.5 block opacity-80">
              боец: {{ cardFighterLabel(card) }}
            </span>
          </button>
          <p v-if="!myHand.length" class="text-12 opacity-50">пусто</p>
        </section>

        <p v-if="error" class="text-14 text-red-600">{{ error }}</p>
      </aside>

      <GameBoard
        class="min-h-140"
        :map="view?.map"
        :players="players"
        :selected-fighter-id="selectedFighterId"
        :highlighted-cell-ids="highlightedCellIds"
        :highlighted-fighter-ids="highlightedFighterIds"
        :framed-fighter-ids="framedFighterIds"
        :interactive="boardInteractive"
        @select-node="onCellClick"
        @select-fighter="onFighterClick"
      />
    </div>

    <div
      v-if="showPickNumHero"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        class="flex max-w-md flex-col gap-4 border border-primary/20 bg-white p-6 shadow-lg"
      >
        <p class="text-16 font-medium">Герой для номерной клетки</p>
        <label
          v-for="hero in myHeroes"
          :key="hero.id"
          class="flex cursor-pointer items-center gap-3 border border-primary/15 p-3"
        >
          <input
            v-model="selectedNumHeroId"
            type="radio"
            class="size-4"
            :value="String(hero.id)"
            @change="onPickNumHero(String(hero.id))"
          />
          <span>{{ hero.name || hero.id }}</span>
        </label>
      </div>
    </div>

    <details v-if="view" class="text-14 opacity-70">
      <summary class="cursor-pointer">view (raw)</summary>
      <pre class="mt-2 max-h-60 overflow-auto border border-primary/10 p-3 text-12">{{
        viewJson
      }}</pre>
    </details>
  </main>
</template>

<script setup>
const route = useRoute();
const { bootstrap, clear } = useGameView();

onUnmounted(() => clear());

if (!route.query.gameId || !route.query.playerId) {
  await navigateTo('/');
} else {
  await bootstrap(String(route.query.gameId), String(route.query.playerId));
}

const {
  view,
  gameId,
  you,
  currentPlayerId,
  currentPlayer,
  players,
  isMyTurn,
  turn,
  phase,
  actionsLeft,
  winner,
  isGameOver,
  me,
  pending,
  error,
  hint,
  isPlacement,
  combat,
  movement,
  targeting,
  lastCombat,
  myFighters,
  myHand,
  myHeroes,
  deckCount,
  results,
  deckClickable,
  okControl,
  backControl,
  boardInteractive,
  showPickNumHero,
  selectedFighterId,
  selectedNumHeroId,
  highlightedCellIds,
  highlightedFighterIds,
  framedFighterIds,
  mapSummary,
  viewJson,
  isCardPlayable,
  cardFighterLabel,
  onSwitchPlayer,
  onDeckClick,
  onCardClick,
  onFinishAction,
  onUiBack,
  onResign,
  onBackToMenu,
  onPickNumHero,
  onFighterClick,
  onCellClick,
} = useGameSession();
</script>
