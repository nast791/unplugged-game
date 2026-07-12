/**
 * PROMPT — вопрос + answers. Pause: wait → effectPrompt (cards).
 */
export const PROMPT = (ctx, payload = {}) => ({
  ...ctx,
  wait: {
    kind: 'PROMPT',
    type: 'PROMPT',
    message: payload.message ?? '?',
    answers: Array.isArray(payload.answers) ? payload.answers : [],
  },
});

export default PROMPT;
