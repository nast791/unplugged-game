import { computed, toValue } from 'vue';
import { HINTS } from '#shared/constants/hints.js';

export const HINT_TONES = { danger: 'danger', wait: 'wait', hint: 'hint' };

const line = value => (typeof value === 'string' ? value.trim() : '');

export const resolveGameHint = (input = {}) => {
  const error = line(input.error);
  if (error) return { text: error, tone: HINT_TONES.danger };

  if (input.aiThinking === true) return { text: HINTS.client.aiThinking(), tone: HINT_TONES.wait };

  const hint = line(input.hint);
  if (hint) return { text: hint, tone: HINT_TONES.hint };

  if (input.pending === true) return { text: HINTS.client.sending(), tone: HINT_TONES.wait };

  return null;
};

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
