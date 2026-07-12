/**
 * ANSWER — ответ на PROMPT совпадает с params.value.
 * ctx.vars.answer задаёт хост после выбора.
 */
export const ANSWER = (ctx, params = {}) => {
  const expected = params.value ?? params.equals;
  if (expected == null) {
    throw new Error('fact ANSWER: нужен params.value');
  }
  const actual = ctx.vars?.answer ?? ctx.answer;
  if (actual == null || actual === '') {
    return { ok: false, value: actual };
  }
  return {
    ok: String(actual) === String(expected),
    value: actual,
  };
};

export default ANSWER;
