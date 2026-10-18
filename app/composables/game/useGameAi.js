import { computed, nextTick, ref, watch } from 'vue';
import { ANIMATION_DURATIONS } from '~/constants/animation.js';
import { useGameView } from '~/composables/game/useGameView.js';
import { useSettings } from '~/composables/ui/useSettings.js';

export const AI_TIME_MS = 400;
export const AI_PAUSE_MS = ANIMATION_DURATIONS.aiPause;
export const AI_MAX_STEPS = 200;

let botPromise = null;

export const loadBot = () => {
  botPromise ??= import('../../../bot/play/ai.js');
  return botPromise;
};

export const nextAiMove = async (state, { timeMs = AI_TIME_MS, overrides } = {}) => {
  const { aiStep } = await loadBot();
  return aiStep(state, { timeMs, overrides });
};

export const nextMoveFor = async (state, playerId, { timeMs = AI_TIME_MS, overrides } = {}) => {
  const { think } = await loadBot();
  return { playerId: String(playerId), ...think(state, playerId, { timeMs, overrides }) };
};

export const pendingAiPlacer = async state => {
  const { pendingPlacementAi } = await loadBot();
  return pendingPlacementAi(state);
};

export const runAiCycle = async (state, apply, options = {}) => {
  const {
    timeMs = AI_TIME_MS,
    pauseMs = AI_PAUSE_MS,
    overrides,
    onMove = null,
    onStall = null,
    maxSteps = AI_MAX_STEPS,
  } = options;
  let current = state;

  for (let step = 0; step < maxSteps; step += 1) {
    if (current == null) return null;

    const placer = await pendingAiPlacer(current);
    const move =
      placer == null
        ? await nextAiMove(current, { timeMs, overrides })
        : await nextMoveFor(current, placer, { timeMs, overrides });

    if (move == null) return current;
    if (move.action == null) {
      if (placer != null) return current;
      if (onStall) onStall(move);
      return current;
    }

    if (onMove) onMove(move);
    current = await apply(move);
    if (pauseMs > 0) await new Promise(resolve => setTimeout(resolve, pauseMs));
  }

  return current;
};

export const useGameAi = () => {
  const { hostState, view, sendAction } = useGameView();
  const { duration } = useSettings();

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
          pauseMs: duration('aiPause'),
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
