import { AI_PAUSE_MS, AI_TIME_MS, runAiCycle } from '~/utils/aiPlayer.js';

export const useGameAi = () => {
  const { hostState, view, sendAction } = useGameView();

  const aiThinking = ref(false);
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
          await nextTick();
          return hostState.value;
        },
        {
          timeMs: AI_TIME_MS,
          pauseMs: AI_PAUSE_MS,
          onMove: move => {
            aiThinking.value = true;
            aiIterations.value = move.iterations ?? 0;
          },
          onStall: move =>
            (aiError.value = `компьютер (${move.playerId}) не нашёл хода — похоже на тупик в правилах`),
        },
      );
    } catch (err) {
      aiError.value = err instanceof Error ? err.message : String(err);
    } finally {
      aiThinking.value = false;
      running = false;
    }
  };

  watch(hostState, () => void playAiCycle(), { immediate: true });

  return { aiThinking, aiIterations, aiError, aiSeats, isVsAi, playAiCycle };
};

export default useGameAi;
