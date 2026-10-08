import { AI_TIME_MS, runAiCycle } from '~/utils/aiPlayer.js';

/**
 * Компьютерные соперники в партии (режим `vs_ai`, `shared/constants/modes.js`).
 *
 * Клиент — хост партии, поэтому за слоты `control: 'ai'` ходы считает он же: после каждого изменения
 * состояния проверяем, чей сейчас ход, и если это компьютер — играем за него, пока ход не вернётся
 * человеку. Ходы применяются по одному (`sendAction`): движок и сервер видят ту же
 * последовательность действий, что и при игре человека, — никакого «прыжка» состояния.
 */
export const useGameAi = () => {
  const { hostState, view, sendAction } = useGameView();

  /** Идёт ли сейчас ход компьютера: интерфейс на это время не кликается. */
  const aiThinking = ref(false);
  /** Сколько доигрываний успел последний ход — видно, что бюджет времени работает. */
  const aiIterations = ref(0);
  const aiError = ref('');
  let running = false;

  const aiSeats = computed(() =>
    (view.value?.settings?.heroes ?? [])
      .filter(slot => String(slot.control) === 'ai')
      .map(slot => String(slot.heroId)),
  );
  const isVsAi = computed(() => aiSeats.value.length > 0);

  const playAiCycle = async () => {
    if (running || !isVsAi.value || !hostState.value) return;
    running = true;
    aiError.value = '';

    try {
      await runAiCycle(
        hostState.value,
        async move => {
          await sendAction({ ...move.action, playerId: move.playerId });
          // даём кадру отрисоваться: иначе ход компьютера выглядит одним прыжком доски
          await nextTick();
          return hostState.value;
        },
        {
          timeMs: AI_TIME_MS,
          onMove: move => {
            aiThinking.value = true;
            aiIterations.value = move.iterations ?? 0;
          },
          // тупик правил: компьютер действует, но движок не предлагает ему ни одного действия
          onStall: move =>
            (aiError.value = `компьютер (${move.playerId}) не нашёл хода — похоже на тупик в правилах`),
        },
      );
    } catch (err) {
      // партия продолжается: ошибку показываем, но состояние не откатываем — его уже сохранил движок
      aiError.value = err instanceof Error ? err.message : String(err);
    } finally {
      aiThinking.value = false;
      running = false;
    }
  };

  // каждое действие меняет объект состояния (движок считает ход на форке), поэтому подписки на объект
  // достаточно: человек сходил — цикл проверит, не настал ли черёд компьютера
  watch(hostState, () => void playAiCycle(), { immediate: true });

  return { aiThinking, aiIterations, aiError, aiSeats, isVsAi, playAiCycle };
};

export default useGameAi;
