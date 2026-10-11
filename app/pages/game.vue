<template>
  <div class="bg-app text-ink relative flex h-full min-h-0 flex-col">
    <Header :mode="modeTitle" :stage="stageLabel" :elapsed="partyTime" />

    <!-- Поле — весь экран под шапкой: подсказка, окно вариантов и плашки висят над ним -->
    <main class="relative min-h-0 flex-1 overflow-hidden">
      <GameBoard
        class="absolute inset-0"
        :map="view?.map"
        :players="players"
        :selected-fighter-id="selectedFighterId"
        :highlighted-cell-ids="highlightedCellIds"
        :placement-cells="placementCells"
        :highlighted-fighter-ids="highlightedFighterIds"
        :framed-fighter-ids="framedFighterIds"
        :interactive="(boardInteractive && !aiThinking) || isPlacement"
        @select-node="onCellClick"
        @select-fighter="onFighterClick"
      />

      <div
        class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-8 px-24 pt-12"
      >
        <HintsWindow
          v-if="gameHint"
          class="pointer-events-auto"
          :text="gameHint.text"
          :tone="gameHint.tone"
        />

        <ChoicePanel class="pointer-events-auto" />
      </div>

      <div class="pointer-events-none absolute top-12 right-12 z-20 flex flex-col items-end gap-8">
        <p
          v-if="activeLimitSeconds"
          class="text-16 rounded-6 pointer-events-auto flex flex-wrap items-center gap-3 border-2 px-16 py-10"
          :class="
            activeLimitExpired
              ? 'border-danger bg-danger/10 text-danger'
              : 'border-line bg-surface/95'
          "
          role="timer"
          aria-live="off"
        >
          {{ activeLimitExpired ? activeLimitExpiredText : activeLimitText }}
        </p>

        <p
          v-for="card in revealedCards"
          :key="`reveal-${card.cardId}`"
          class="text-16 border-violet/50 bg-violet/10 rounded-6 pointer-events-auto border-2 px-16 py-10"
        >
          Раскрыта карта ({{ card.ownerName }}): «{{ card.name }}» · значение {{ card.value }} ·
          бонус {{ card.bonus }} — её видят все игроки
        </p>
      </div>

      <p
        v-if="sessionError"
        class="text-16 border-accent/50 bg-surface rounded-6 pointer-events-auto absolute inset-x-24 top-24 z-30 flex flex-wrap items-center gap-3 border-2 px-16 py-10"
      >
        {{ sessionError }}
        <NuxtLink to="/" class="underline">В лобби</NuxtLink>
      </p>

      <div v-if="!anyModalOpen" class="fixed right-0 bottom-0 left-0 z-10 flex items-end gap-8">
        <PlayersPanel class="max-h-[calc(100dvh_-_96*var(--spacing))]" />

        <CardsPanel />

        <div class="flex flex-col items-end gap-8 p-12">
          <PlacementTray />

          <div class="flex items-end gap-12">
            <DeckPile />

            <DiscardPile />

            <FinishButton />
          </div>
        </div>
      </div>

      <DiscardModal />

      <div
        v-if="showPickNumHero"
        class="bg-app/70 fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="border-line bg-surface flex max-w-md flex-col gap-4 border-2 p-6 shadow-2xl">
          <p class="text-18 font-medium">Герой для номерной клетки</p>
          <label
            v-for="hero in myHeroes"
            :key="hero.id"
            class="border-line flex cursor-pointer items-center gap-3 border-2 p-3"
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
    </main>
  </div>
</template>

<script setup>
import { HINTS } from '#shared/constants/hints.js';
import { modes } from '#shared/constants/modes.js';
import GameBoard from '~/components/game/Board.vue';
import DeckPile from '~/components/molecules/game/DeckPile.vue';
import DiscardPile from '~/components/molecules/game/DiscardPile.vue';
import FinishButton from '~/components/molecules/game/FinishButton.vue';
import PlacementTray from '~/components/molecules/game/PlacementTray.vue';
import CardsPanel from '~/components/organisms/game/CardsPanel.vue';
import ChoicePanel from '~/components/organisms/game/ChoicePanel.vue';
import PlayersPanel from '~/components/organisms/game/PlayersPanel.vue';
import DiscardModal from '~/components/organisms/modals/DiscardModal.vue';
import HintsWindow from '~/components/organisms/game/HintsWindow.vue';
import Header from '~/components/organisms/layout/Header.vue';
import { ensureClock, useClock } from '~/composables/useClock.js';
import { addActiveModal, isAnyModalOpen, removeActiveModal } from '~/composables/ui/useModal.js';
import { useGameHint } from '~/composables/useGameHint.js';
import { useSeoTitle } from '~/composables/useSeoTitle';
import { timeoutLosers } from '~/utils/timeLoss.js';

const route = useRoute();
const { bootstrap, clear } = useGameView();

const anyModalOpen = isAnyModalOpen();

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
  steps,
  actingPlayerId,
  isHumanSeat,
  resignByTimeout,
  players,
  isGameOver,
  pending,
  error,
  hint,
  isPlacement,
  myHeroes,
  revealedCards,
  boardInteractive,
  showPickNumHero,
  selectedFighterId,
  selectedNumHeroId,
  highlightedCellIds,
  highlightedFighterIds,
  framedFighterIds,
  placementCells,
  onPickNumHero,
  onFighterClick,
  onCellClick,
  clearFighterSelection,
} = useGameSession();

watch(
  showPickNumHero,
  open => (open ? addActiveModal('pickNumHero') : removeActiveModal('pickNumHero')),
  { immediate: true },
);

onBeforeUnmount(() => removeActiveModal('pickNumHero'));

/**
 * Счётчики времени — все на одном композабле (`useClock`): он умеет считать **от нуля** и **к нулю**, а у
 * каждого счётчика своё имя и своё хранилище (`unplugged:clock:<имя>`), поэтому счётчиков может быть
 * сколько угодно, и они не перетирают друг друга.
 *
 * - `party:play` — сколько идёт партия: отметку ставим один раз, на выходе из расстановки (расстановка —
 *   подготовка, а не игра), перезагрузку отметка переживает;
 * - `party:placement` — сколько осталось на расстановку: бюджет **один на всю фазу**, поэтому считается
 *   от отметки, которую поставило лобби при создании партии, а не перезапуском;
 * - лимит на действие — счётчик без имени: переживать перезагрузку ему нечего, зато он перезапускается на
 *   каждое решение (`steps` растёт и на ходы компьютера) и на смену смотрящего.
 *
 * Ни один из них не пишет время в состояние движка: партия воспроизводима по сиду.
 */
const limitSeconds = setting => Math.max(0, Number(view.value?.settings?.[setting] ?? 0));
const limitLabel = seconds => (seconds >= 60 ? `${Math.round(seconds / 60)} мин` : `${seconds} с`);

const actionLimitSeconds = computed(() => limitSeconds('actionLimit'));
const placementLimitSeconds = computed(() => limitSeconds('placementLimit'));

/**
 * Лимит — **правило партии, а не подсказка**: время вышло — тот, чьего решения ждали, выбывает (`RESIGN`).
 * В расстановке выбывают все, кто не подтвердил её (бюджет один на фазу), в игре — действующий игрок.
 * Кто именно проигрывает, решает чистая функция (`app/utils/timeLoss.js`), а отправляет сдачу сессия
 * (`resignByTimeout`): за слот компьютера не сдаём никого — там ходы считает клиент.
 */
const loseByTimeout = placement => {
  const losers = timeoutLosers({
    placement,
    players: players.value,
    actorId: actingPlayerId.value,
  });
  if (losers.length) resignByTimeout(losers);
};

const playClock = useClock({ key: 'party:play', mode: 'up' });
const placementClock = useClock({
  key: 'party:placement',
  mode: 'down',
  limit: () => placementLimitSeconds.value * 1000,
  // Пока расстановка идёт: если она уже закончилась, платить за неё нечем.
  onExpire: () => {
    if (isPlacement.value) loseByTimeout(true);
  },
});
const actionClock = useClock({
  mode: 'down',
  limit: () => actionLimitSeconds.value * 1000,
  onExpire: () => loseByTimeout(false),
});

/** Партия началась ровно один раз: отметка ставится на выходе из расстановки. */
watch(
  isPlacement,
  placement => {
    if (placement) return;
    ensureClock('party:play');
    // Расстановка кончилась — её бюджет больше никого не ждёт (и не должен выстрелить позже).
    placementClock.stop();
  },
  { immediate: true },
);
watch(
  () => [steps.value, actingPlayerId.value, isGameOver.value],
  () => {
    // Лимит идёт только пока решение за человеком: за компьютер думает клиент, и наказывать за это
    // некого. В конце партии лимиту тоже не про что идти.
    if (isGameOver.value || !isHumanSeat(actingPlayerId.value)) {
      actionClock.stop();
      return;
    }
    actionClock.restart();
  },
  { immediate: true },
);

/** Время партии для шапки: пока игра не началась, счётчик пуст — и шапка его не показывает. */
const partyTime = playClock.label;

/**
 * Плашка лимита одна на экран: в расстановке показываем её бюджет, дальше — лимит на действие. Оба
 * лимита необязательные, поэтому при нуле плашки нет вовсе.
 */
const activeLimitClock = computed(() => (isPlacement.value ? placementClock : actionClock));
const activeLimitSeconds = computed(() =>
  isPlacement.value ? placementLimitSeconds.value : actionLimitSeconds.value,
);
const activeLimitLabel = computed(() => limitLabel(activeLimitSeconds.value));
const activeLimitExpired = computed(
  () => activeLimitSeconds.value > 0 && activeLimitClock.value.expired.value,
);
const activeLimitText = computed(
  () =>
    `${isPlacement.value ? 'Расстановка' : 'На действие'}: ${activeLimitClock.value.label.value} из ${activeLimitLabel.value}`,
);
/** Тексты — из словаря подсказок (`shared/constants/hints.js`): экран только подставляет числа. */
const activeLimitExpiredText = computed(() =>
  isPlacement.value
    ? HINTS.client.placementExpired({ limit: activeLimitLabel.value })
    : HINTS.client.timerExpired({ limit: activeLimitLabel.value }),
);

/** Режим партии и раунд — для шапки: название берём из реестра режимов, а не из строки состояния. */
const modeTitle = computed(() => {
  const name = view.value?.settings?.mode;
  if (!name) return '';
  return modes.find(mode => mode.name === name)?.title ?? String(name);
});
const round = computed(() => Number(view.value?.round) || 1);

/**
 * Этап партии для шапки: в расстановке раунда ещё нет (движок держит `round: 1` с самого начала), поэтому
 * вместо «Раунд 1» пишем «Расстановка» — это первая фаза партии, а не первый раунд.
 */
const stageLabel = computed(() => (isPlacement.value ? 'Расстановка' : `Раунд ${round.value}`));

/** Заголовок вкладки — **название режима**, как у лобби: кто с кем играет, в title не выносим. */
useSeoTitle(() => modeTitle.value || 'Партия');

/** Компьютерные соперники: ходы за них считает клиент (`app/composables/useGameAi.js`). */
const { aiThinking } = useGameAi();

/**
 * Окно подсказок: одна строка на экран и одно правило старшинства (`useGameHint` → `resolveGameHint`).
 * Ошибка важнее подсказки фазы, а ход компьютера — важнее её же: в `vs_ai` подсказка движка в этот
 * момент адресована не человеку. Пусто — окно не рисуем.
 */
const boardWaitingForAi = computed(() => aiThinking.value && !isPlacement.value);
const { hint: gameHint } = useGameHint({ error, aiThinking: boardWaitingForAi, hint, pending });

/**
 * В расстановке активность аватарки снимается кликом по любому месту экрана, кроме подсвеченной клетки.
 * Клики по доске разбирает сама доска (`select-node`: клетка или `null`) — её экран пропускает, иначе
 * снятие отменяло бы только что поставленного бойца.
 */
const onScreenClick = event => {
  if (!isPlacement.value) return;
  if (event?.target?.closest?.('[data-board]')) return;
  clearFighterSelection();
};

onMounted(() => document.addEventListener('click', onScreenClick));
onBeforeUnmount(() => document.removeEventListener('click', onScreenClick));
</script>
