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
      v-if="placementHint"
      class="border border-primary/20 bg-primary/5 px-4 py-3 text-16"
    >
      {{ placementHint }}
    </p>

    <section class="grid gap-2 border border-primary/15 p-3 text-14 sm:grid-cols-3">
      <p>
        phase:
        <strong>{{ phase ?? '—' }}</strong>
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
      <p v-if="effectPrompt" class="sm:col-span-3 text-emerald-900">
        {{ effectPrompt.name }}
        <template v-if="effectPrompt.kind === 'PROMPT'">
          · {{ effectPrompt.message }}
        </template>
        <template v-else-if="effectPrompt.kind === 'HIGHLIGHT_TARGETS'">
          · выберите цель ({{ effectPrompt.candidates?.length || 0 }})
        </template>
      </p>
      <p v-if="handDiscard" class="sm:col-span-3 text-violet-800">
        сброс руки: нужно сбросить ещё {{ handDiscard.mustDiscard }} (лимит
        {{ handDiscard.max }})
      </p>
      <p v-if="movement" class="sm:col-span-3 text-sky-800">
        перемещение открыто
        <template v-if="movement.bonus">
          · усиление +{{ movement.bonus }}
        </template>
        · origins {{ JSON.stringify(movement.origins || {}) }}
      </p>
      <p v-if="lastCombat" class="sm:col-span-3 text-emerald-800">
        бой: {{ lastCombat.attackValue }} vs {{ lastCombat.defenseValue }} →
        урон {{ lastCombat.combatDamage }} · победил
        {{ lastCombat.winner === 'attacker' ? 'атакующий' : 'защитник' }}
        ({{ lastCombat.winnerPlayerId }})
      </p>
      <p v-if="combat" class="sm:col-span-3 text-amber-800">
        combat: atk {{ combat.attackValue }} → {{ combat.targetFighterId }} · ждёт
        DEFEND ({{ combat.defenderPlayerId }})
      </p>
      <p v-if="isGameOver" class="sm:col-span-3">
        gameEnd · winner: <strong>{{ winner === null ? 'ничья' : winner }}</strong>
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
          </button>
        </section>

        <section class="flex flex-col gap-2 border border-primary/15 p-3">
          <p class="text-14 font-medium">Бойцы</p>
          <p class="text-12 opacity-60">
            <template v-if="isPlacement && placementPhase === 'place'">
              Расставьте всех бойцов в своей зоне. Главный герой на номерной
              клетке не двигается.
            </template>
            <template v-else-if="isPlacement && placementPhase === 'pickNumHero'">
              Выберите героя для номерной клетки (кнопка ОК).
            </template>
            <template v-else-if="handDiscard && iMustDiscard">
              Рука &gt; {{ handDiscard.max }}: выберите карту и «Сбросить».
            </template>
            <template v-else-if="effectPrompt && iMustEffect">
              <template v-if="effectPrompt.kind === 'PROMPT'">
                {{ effectPrompt.message || effectPrompt.name }}
              </template>
              <template v-else>
                {{ effectPrompt.name }}: кликните подсвеченного врага.
              </template>
            </template>
            <template v-else-if="combat"> DEFEND: карта defense|hybrid или пас. </template>
            <template v-else-if="movement">
              Шаги в радиусе move(+усиление) бесплатны. Карта → «Усилить» (1
              раз). «Завершить» = 1 AP + добор.
            </template>
            <template v-else>
              MOVE (завершить = 1 AP) · усиление сбросом карты · ATTACK /
              PLAY_CARD (1 AP). AP: {{ actionsLeft }}.
            </template>
          </p>
          <ul v-if="isPlacement" class="flex flex-col gap-1 text-12 opacity-70">
            <li v-for="player in players" :key="`ready-${player.id}`">
              {{ player.name || player.id }}:
              {{ player.placementReady ? 'подтвердил' : 'расставляет…' }}
            </li>
          </ul>
          <p class="text-12">
            боец: <strong>{{ selectedLabel }}</strong>
            · карта: <strong>{{ selectedCardLabel }}</strong>
          </p>
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
            @click="selectFighter(fighter.id)"
          >
            {{ fighter.name || fighter.id }}
            <span class="opacity-70">
              · {{ fighter.type }}
              · hp {{ fighter.currentHp }}/{{ fighter.hp }}
              ·
              {{
                fighter.currentPosition == null ? 'не на доске' : `кл. ${fighter.currentPosition}`
              }}
              <template v-if="isPlacement && fighter.type === 'hero' && fighter.currentPosition != null">
                · номерная
              </template>
            </span>
          </button>
        </section>

        <section
          v-if="!isPlacement"
          class="flex flex-col gap-2 border border-primary/15 p-3"
        >
          <p class="text-14 font-medium">Hand ({{ myHand.length }})</p>
          <button
            v-for="card in myHand"
            :key="card.instanceId || card.id"
            type="button"
            class="border border-primary/20 px-2 py-1.5 text-left text-12"
            :class="
              String(selectedCardId) === String(card.instanceId || card.id)
                ? 'bg-primary text-white'
                : 'bg-white'
            "
            @click="selectCard(card)"
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

        <section class="flex flex-wrap gap-2">
          <button
            v-if="handDiscard && iMustDiscard"
            type="button"
            class="bg-primary px-3 py-2 text-14 text-white disabled:opacity-40"
            :disabled="pending || !selectedCardId || isGameOver"
            @click="onDiscard"
          >
            Сбросить (ещё {{ handDiscard.mustDiscard }})
          </button>
          <template v-if="effectPrompt && iMustEffect && effectPrompt.kind === 'PROMPT'">
            <button
              v-for="ans in effectPrompt.answers || []"
              :key="ans.value"
              type="button"
              class="px-3 py-2 text-14 disabled:opacity-40"
              :class="
                String(ans.value) === 'yes' || String(ans.value) === 'apply'
                  ? 'bg-primary text-white'
                  : 'border border-primary'
              "
              :disabled="pending || isGameOver"
              @click="onSkillAnswer(ans.value)"
            >
              {{ ans.text || ans.value }}
            </button>
          </template>
          <button
            v-if="canBonusMove"
            type="button"
            class="border border-primary px-3 py-2 text-14 disabled:opacity-40"
            :disabled="pending || isGameOver"
            @click="onBonusMove"
          >
            Усилить перемещение
            <template v-if="selectedCardId"> (бон.)</template>
          </button>
          <button
            v-if="movement && isMyTurn && !handDiscard && !effectPrompt"
            type="button"
            class="bg-primary px-3 py-2 text-14 text-white disabled:opacity-40"
            :disabled="pending || isGameOver"
            @click="onConfirmMove"
          >
            Завершить перемещение
          </button>
          <button
            type="button"
            class="bg-primary px-3 py-2 text-14 text-white disabled:opacity-40"
            :disabled="pending || isGameOver || !okEnabled"
            @click="onUiOk"
          >
            <template v-if="isPlacement && iAmReady">Ожидание…</template>
            <template v-else>ОК</template>
          </button>
          <button
            v-if="backVisible"
            type="button"
            class="border border-primary px-3 py-2 text-14 disabled:opacity-40"
            :disabled="pending || isGameOver || !backEnabled"
            @click="onUiBack"
          >
            Назад
          </button>
          <template v-if="combat && iAmDefender">
            <button
              type="button"
              class="bg-primary px-3 py-2 text-14 text-white disabled:opacity-40"
              :disabled="pending || !selectedDefenseCard"
              @click="onDefend(true)"
            >
              DEFEND картой
            </button>
            <button
              type="button"
              class="border border-primary px-3 py-2 text-14 disabled:opacity-40"
              :disabled="pending"
              @click="onDefend(false)"
            >
              Пас (полный урон)
            </button>
          </template>
          <button
            v-if="!isPlacement && !combat && !handDiscard && !effectPrompt"
            type="button"
            class="border border-primary px-3 py-2 text-14 disabled:opacity-40"
            :disabled="pending || !isMyTurn || !selectedEffectCard || movement || combat || isGameOver"
            @click="onPlayCard"
          >
            PLAY_CARD
          </button>
          <button
            type="button"
            class="bg-primary px-3 py-2 text-14 text-white disabled:opacity-40"
            :disabled="
              pending ||
              isPlacement ||
              combat ||
              movement ||
              handDiscard ||
              effectPrompt ||
              !isMyTurn ||
              isGameOver
            "
            @click="onEndTurn"
          >
            END_TURN
          </button>
          <button
            type="button"
            class="border border-primary px-3 py-2 text-14 disabled:opacity-40"
            :disabled="pending || isGameOver"
            @click="onResign"
          >
            RESIGN
          </button>
        </section>

        <p v-if="error" class="text-14 text-red-600">{{ error }}</p>
        <p v-if="hint" class="text-14 opacity-70">{{ hint }}</p>
      </aside>

      <GameBoard
        class="min-h-140"
        :map="view?.map"
        :players="players"
        :selected-fighter-id="selectedFighterId"
        :highlighted-cell-ids="highlightedCellIds"
        :interactive="boardInteractive"
        @select-node="onSelectNode"
        @select-fighter="onSelectFighterFromBoard"
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
  selectedFighterId,
  selectedCardId,
  isPlacement,
  combat,
  movement,
  handDiscard,
  effectPrompt,
  lastCombat,
  iAmReady,
  iAmDefender,
  iMustDiscard,
  iMustEffect,
  myFighters,
  myHand,
  placementHint,
  ui,
  placementPhase,
  showPickNumHero,
  myHeroes,
  selectedNumHeroId,
  okEnabled,
  backVisible,
  backEnabled,
  selectedCardLabel,
  selectedLabel,
  selectedDefenseCard,
  selectedEffectCard,
  canBonusMove,
  boardInteractive,
  highlightedCellIds,
  mapSummary,
  viewJson,
  cardFighterLabel,
  selectFighter,
  selectCard,
  onSwitchPlayer,
  onDiscard,
  onEndTurn,
  onConfirmMove,
  onBonusMove,
  onUiOk,
  onUiBack,
  onPickNumHero,
  onResign,
  onPlayCard,
  onDefend,
  onSkillAnswer,
  onSelectFighterFromBoard,
  onSelectNode,
} = useGameSession();
</script>
