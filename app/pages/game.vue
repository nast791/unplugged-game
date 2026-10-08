<template>
  <main class="flex flex-1 flex-col gap-4 p-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <h1 class="text-28 font-semibold tracking-tight">Партия</h1>
        <p class="text-14 opacity-60">
          gameId: <code>{{ gameId ?? '—' }}</code> · map: {{ mapSummary }}
        </p>
      </div>
      <NuxtLink to="/" class="text-16 underline opacity-70 hover:opacity-100"> В лобби </NuxtLink>
    </header>

    <p v-if="hint" class="border-primary/20 bg-primary/5 text-16 border px-4 py-3">
      {{ hint }}
    </p>

    <p v-if="error" class="text-16 border border-red-300 bg-red-50 px-4 py-3 text-red-700">
      {{ error }}
    </p>

    <p
      v-if="sessionError"
      class="text-16 flex flex-wrap items-center gap-3 border border-amber-300 bg-amber-50 px-4 py-3"
    >
      {{ sessionError }}
      <NuxtLink to="/" class="underline">В лобби</NuxtLink>
    </p>

    <p v-if="combatInfo" class="text-14 border border-amber-300 bg-amber-50 px-4 py-3">
      {{ combatInfo }}
    </p>

    <p
      v-if="turnLimitMs"
      class="text-16 flex flex-wrap items-center gap-3 border px-4 py-3"
      :class="
        timeExpired ? 'border-red-300 bg-red-50 text-red-700' : 'border-primary/20 bg-primary/5'
      "
      role="timer"
      aria-live="off"
    >
      <span v-if="timeExpired">Время хода вышло — передайте ход ({{ turnLimitLabel }}).</span>
      <span v-else>На ход: {{ timeLabel }} из {{ turnLimitLabel }}</span>
    </p>

    <p
      v-for="card in revealedCards"
      :key="`reveal-${card.cardId}`"
      class="text-14 border border-violet-300 bg-violet-50 px-4 py-3"
    >
      Раскрыта карта ({{ card.ownerName }}): «{{ card.name }}» · значение {{ card.value }} · бонус
      {{ card.bonus }} — её видят все игроки
    </p>

    <section class="border-primary/15 text-14 grid gap-2 border p-3 sm:grid-cols-3">
      <p>
        phase: <strong>{{ phase ?? '—' }}</strong>
        <span v-if="isPlacement" class="opacity-60"> · расстановка</span>
      </p>
      <p>
        turn: <strong>{{ turn }}</strong>
      </p>
      <p>
        current: <strong>{{ currentPlayerId ?? '—' }}</strong>
      </p>
      <p>
        AP: <strong>{{ actionsLeft }}</strong>
      </p>
      <p>
        you: <strong>{{ you ?? '—' }}</strong>
      </p>
      <p>
        isMyTurn:
        <strong :class="isMyTurn ? 'text-green-700' : 'opacity-50'">{{ isMyTurn }}</strong>
      </p>
      <p v-if="targeting" class="text-emerald-900 sm:col-span-3">
        выбор цели: {{ targeting.candidates?.length ?? 0 }} кандидат(ов)
      </p>
      <p v-if="movement" class="text-sky-800 sm:col-span-3">
        перемещение открыто
        <template v-if="movement.bonus"> · усиление +{{ movement.bonus }}</template>
      </p>
      <p v-if="combat" class="text-amber-800 sm:col-span-3">
        бой: {{ combat.stage }}
        <template v-if="combat.targetFighterId"> · цель {{ combat.targetFighterId }} </template>
        <template v-if="combat.defenderPlayerId">
          · защищается {{ combat.defenderPlayerId }}
        </template>
      </p>
      <p v-if="lastCombat" class="text-emerald-800 sm:col-span-3">
        прошлый бой: {{ lastCombat.attackValue }} vs {{ lastCombat.defenseValue }} → урон
        {{ lastCombat.combatDamage }} · победил
        {{ lastCombat.winner === 'attacker' ? 'атакующий' : 'защитник' }}
        ({{ lastCombat.winnerPlayerId }})
      </p>
      <p v-if="isGameOver" class="sm:col-span-3">
        gameEnd · победа:
        <strong>{{ results?.winnerName ?? winner ?? '—' }}</strong>
      </p>
    </section>

    <!-- доска — основная площадь экрана: две трети высоты и вся ширина, кроме боковой панели -->
    <div class="grid flex-1 gap-4 lg:grid-cols-[240px_1fr]">
      <aside class="flex flex-col gap-3">
        <section class="border-primary/15 flex flex-col gap-2 border p-3">
          <p class="text-14 font-medium">{{ isVsAi ? 'Против компьютера' : 'Hotseat' }}</p>
          <p v-if="isVsAi" class="text-12 opacity-60">
            за компьютер играет клиент:
            <strong>{{ aiNames }}</strong>
            ·
            {{
              aiThinking
                ? 'думает…'
                : aiIterations
                  ? `последний ход — ${aiIterations} доигрываний`
                  : 'ждёт хода'
            }}
          </p>
          <p v-if="aiError" class="text-12 text-red-600">{{ aiError }}</p>
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
            class="border-primary/20 text-14 border px-3 py-2 text-left disabled:opacity-40"
            :class="String(you) === String(player.id) ? 'bg-primary text-white' : ''"
            :disabled="pending || aiThinking || String(you) === String(player.id)"
            @click="onSwitchPlayer(player.id)"
          >
            {{ player.name || player.id }}
            <span v-if="String(currentPlayerId) === String(player.id)" class="opacity-70">
              · ход
            </span>
            <span v-if="player.resigned" class="opacity-70"> · сдался</span>
          </button>
        </section>

        <section v-if="!isGameOver" class="border-primary/15 flex flex-col gap-2 border p-3">
          <p class="text-14 font-medium">Действия</p>
          <button
            type="button"
            class="border-primary/20 text-14 border px-3 py-2 text-left disabled:opacity-40"
            :disabled="pending || aiThinking || isGameOver || !deckClickable"
            @click="onDeckClick"
          >
            Колода ({{ deckCount }})
          </button>
          <button
            v-if="okControl.visible"
            type="button"
            class="bg-primary text-14 px-3 py-2 text-white disabled:opacity-40"
            :disabled="pending || aiThinking || isGameOver || !okControl.enabled"
            @click="onFinishAction"
          >
            <template v-if="isPlacement && !okControl.enabled">Ожидание…</template>
            <template v-else>{{ okControl.label || 'ОК' }}</template>
          </button>
          <button
            v-if="backControl.visible"
            type="button"
            class="border-primary text-14 border px-3 py-2 disabled:opacity-40"
            :disabled="pending || aiThinking || isGameOver || !backControl.enabled"
            @click="onUiBack"
          >
            {{ backControl.label || 'Назад' }}
          </button>
          <button
            v-if="!isGameOver"
            type="button"
            class="border-primary text-14 border px-3 py-2 disabled:opacity-40"
            :disabled="pending || aiThinking"
            @click="onResign"
          >
            Сдаться
          </button>
          <p class="text-12 opacity-60">
            действие объявляется кликом: колода — перемещение, карта атаки — бой.
          </p>
        </section>

        <section class="border-primary/15 flex flex-col gap-2 border p-3">
          <p class="text-14 font-medium">Бойцы</p>
          <p v-if="isPlacement" class="text-12 opacity-60">
            <template v-if="placementPhase === 'pickNumHero'">
              Выберите героя для номерной клетки.
            </template>
            <template v-else>
              Расставьте всех бойцов на клетках в одной области с героем, затем нажмите «ОК».
            </template>
          </p>
          <ul v-if="isPlacement" class="text-12 flex flex-col gap-1 opacity-70">
            <li v-for="player in players" :key="`ready-${player.id}`">
              {{ player.name || player.id }}:
              {{ player.placementReady ? 'подтвердил' : 'расставляет…' }}
            </li>
          </ul>
          <button
            v-for="fighter in myFighters"
            :key="fighter.id"
            type="button"
            class="border-primary/20 text-14 border px-3 py-2 text-left disabled:opacity-40"
            :disabled="aiThinking"
            :class="
              String(selectedFighterId) === String(fighter.id)
                ? 'bg-primary text-white'
                : 'bg-white'
            "
            @click="onFighterClick({ fighterId: fighter.id })"
          >
            {{ fighter.name || fighter.id }}
            <span class="opacity-70">
              · {{ fighter.type }} · hp {{ fighter.currentHp }}/{{ fighter.startHp }}
              ·
              {{
                fighter.currentPosition == null ? 'не на доске' : `кл. ${fighter.currentPosition}`
              }}
            </span>
          </button>
          <ul v-if="myItems.length" class="text-12 flex flex-col gap-1 opacity-70">
            <li v-for="item in myItems" :key="item.id">
              {{ item.name || item.id }} · {{ itemStateLabel(item, item.state) }}
              <span v-if="item.condition"> — {{ item.condition }}</span>
            </li>
          </ul>
        </section>

        <section v-if="isGameOver" class="border-primary/15 flex flex-col gap-2 border p-3">
          <p class="text-14 font-medium">Итоги партии</p>
          <p class="text-16">
            Победа: <strong>{{ results?.winnerName ?? '—' }}</strong>
          </p>
          <p class="text-12 opacity-70">
            раундов: {{ results?.round ?? '—' }} · ходов: {{ results?.turn ?? '—' }}
          </p>
          <ul class="text-12 flex flex-col gap-1">
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
            class="bg-primary text-14 px-3 py-2 text-white"
            @click="onBackToMenu"
          >
            В меню
          </button>
        </section>

        <section
          v-if="choices.length"
          class="flex flex-col gap-2 border border-amber-400/60 bg-amber-50 p-3"
        >
          <p class="text-14 font-medium">Свойство карты</p>
          <button
            v-for="choice in choices"
            :key="choice.optionId"
            type="button"
            class="border-primary/20 text-14 border px-3 py-2 text-left disabled:opacity-40"
            :class="choice.disabled ? 'bg-zinc-100' : 'bg-white'"
            :disabled="pending || choice.disabled"
            @click="onChoiceClick(choice.optionId)"
          >
            {{ choice.title }}
            <span v-if="choice.disabled" class="opacity-70"> · недоступно</span>
          </button>
        </section>

        <section
          v-if="targetingChoices.length"
          class="flex flex-col gap-2 border border-amber-400/60 bg-amber-50 p-3"
        >
          <p class="text-14 font-medium">Выберите карту</p>
          <button
            v-for="choice in targetingChoices"
            :key="choice.optionId"
            type="button"
            class="border-primary/20 text-14 border px-3 py-2 text-left disabled:opacity-40"
            :class="choice.disabled ? 'bg-zinc-100' : 'bg-white'"
            :disabled="pending || choice.disabled"
            @click="onChoiceClick(choice.optionId)"
          >
            {{ choice.title }}
            <span v-if="choice.disabled" class="opacity-70"> · недоступно</span>
          </button>
        </section>

        <section
          v-if="pickCandidates.length"
          class="flex flex-col gap-2 border border-sky-400/60 bg-sky-50 p-3"
        >
          <p class="text-14 font-medium">Кого выбрать</p>
          <button
            v-for="fighter in pickCandidates"
            :key="`pick-${fighter.id}`"
            type="button"
            class="border-primary/20 text-14 border bg-white px-3 py-2 text-left disabled:opacity-40"
            :disabled="pending"
            @click="onFighterClick({ fighterId: fighter.id })"
          >
            {{ fighter.name || fighter.id }}
            <span class="opacity-70">
              · {{ fighter.playerName }} · hp {{ fighter.currentHp }}
            </span>
          </button>
        </section>

        <section
          v-if="!isPlacement && !isGameOver"
          class="border-primary/15 flex flex-col gap-2 border p-3"
        >
          <p class="text-14 font-medium">Hand ({{ myHand.length }})</p>
          <button
            v-for="card in myHand"
            :key="card.instanceId || card.id"
            type="button"
            class="border-primary/20 text-12 border px-2 py-1.5 text-left disabled:opacity-40"
            :class="isCardPlayable(card) ? 'bg-white' : 'bg-zinc-100'"
            :disabled="pending || isGameOver || !isCardPlayable(card)"
            @click="onCardClick(card)"
          >
            <span class="font-medium">{{ card.title || card.id }}</span>
            <span class="opacity-70">
              · {{ card.type }}{{ card.value != null ? ` ${card.value}` : '' }}
              <template v-if="card.bonus != null"> · бон.{{ card.bonus }} </template>
              · боец: {{ cardFighterLabel(card) }}
            </span>
            <span v-if="card.text" class="mt-0.5 block opacity-80">
              {{ card.text }}
            </span>
            <span
              v-for="option in card.options ?? []"
              :key="option.id"
              class="mt-0.5 block opacity-70"
            >
              — {{ option.text }}
            </span>
          </button>
          <p v-if="!myHand.length" class="text-12 opacity-50">пусто</p>
        </section>

        <p v-if="error" class="text-14 text-red-600">{{ error }}</p>
      </aside>

      <GameBoard
        class="min-h-140"
        style="min-height: 66vh"
        :map="view?.map"
        :players="players"
        :selected-fighter-id="selectedFighterId"
        :highlighted-cell-ids="highlightedCellIds"
        :highlighted-fighter-ids="highlightedFighterIds"
        :framed-fighter-ids="framedFighterIds"
        :interactive="boardInteractive && !aiThinking"
        @select-node="onCellClick"
        @select-fighter="onFighterClick"
      />
    </div>

    <div
      v-if="showPickNumHero"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div class="border-primary/20 flex max-w-md flex-col gap-4 border bg-white p-6 shadow-lg">
        <p class="text-16 font-medium">Герой для номерной клетки</p>
        <label
          v-for="hero in myHeroes"
          :key="hero.id"
          class="border-primary/15 flex cursor-pointer items-center gap-3 border p-3"
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
      <pre class="border-primary/10 text-12 mt-2 max-h-60 overflow-auto border p-3">{{
        viewJson
      }}</pre>
    </details>
  </main>
</template>

<script setup>
import { useSeoTitle } from '~/composables/useSeoTitle';
import { useTimer } from '~/composables/useTimer';

const route = useRoute();
const { bootstrap, clear } = useGameView();

/** Партия живёт в этой вкладке; если её нет — объясняем и отправляем в лобби вместо пустой страницы. */
const sessionError = ref('');

onUnmounted(() => clear());

if (!route.query.gameId || !route.query.playerId) {
  await navigateTo('/');
} else {
  try {
    await bootstrap(String(route.query.gameId), String(route.query.playerId));
  } catch (err) {
    sessionError.value =
      err instanceof Error
        ? err.message
        : 'Партия не найдена в этой вкладке — начните новую из лобби';
  }
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
  choices,
  targetingChoices,
  myItems,
  itemStateLabel,
  pickCandidates,
  combatInfo,
  revealedCards,
  deckClickable,
  okControl,
  backControl,
  boardInteractive,
  showPickNumHero,
  placementPhase,
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
  onChoiceClick,
  onFinishAction,
  onUiBack,
  onResign,
  onBackToMenu,
  onPickNumHero,
  onFighterClick,
  onCellClick,
} = useGameSession();

/**
 * Лимит времени на ход из настроек партии (`settings.turnLimit`, секунды; 0 — без лимита). Таймер
 * считает от метки дедлайна (`useTimer`) и перезапускается на каждом новом ходу: время в состояние
 * движка не пишется — иначе партия перестала бы быть воспроизводимой по сиду.
 */
const turnLimitSeconds = computed(() => Math.max(0, Number(view.value?.settings?.turnLimit ?? 0)));
const turnLimitMs = computed(() => turnLimitSeconds.value * 1000);
const turnLimitLabel = computed(() =>
  turnLimitSeconds.value >= 60
    ? `${Math.round(turnLimitSeconds.value / 60)} мин`
    : `${turnLimitSeconds.value} с`,
);
const turnTimer = useTimer({ duration: () => turnLimitMs.value });
const timeLabel = turnTimer.label;
const timeExpired = turnTimer.expired;
watch(
  () => [turn.value, currentPlayerId.value],
  () => turnTimer.restart(),
  { immediate: true },
);

/** Динамический заголовок вкладки: состав партии известен только здесь («Партия: Анубис против Теслы»). */
useSeoTitle(() => {
  const names = players.value.map(player => player.name).filter(Boolean);

  return names.length ? `Партия: ${names.join(' против ')}` : 'Партия';
});

/** Компьютерные соперники: ходы за них считает клиент (`app/composables/useGameAi.js`). */
const { aiThinking, aiIterations, aiError, aiSeats, isVsAi } = useGameAi();

/** Имена компьютеров для панели: id игрока — это id героя, а в партии у него человеческое имя. */
const aiNames = computed(() =>
  aiSeats.value
    .map(id => players.value.find(player => String(player.id) === String(id))?.name ?? String(id))
    .join(', '),
);
</script>
