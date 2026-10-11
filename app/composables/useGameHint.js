import { computed, toValue } from 'vue';
import { resolveGameHint } from '~/utils/gameHint.js';

export const useGameHint = (sources = {}) => {
  const hint = computed(() =>
    resolveGameHint({
      error: toValue(sources.error),
      aiThinking: toValue(sources.aiThinking),
      hint: toValue(sources.hint),
      pending: toValue(sources.pending),
    }),
  );

  return { hint };
};

export default useGameHint;
