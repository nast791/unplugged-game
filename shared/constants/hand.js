/** Лимит руки в конце хода (сброс до этого числа). */
export const MAX_HAND_SIZE = 7;

export const maxHandSize = (state) => {
  const fromRules = Number(state?.rules?.maxHandSize);
  if (Number.isInteger(fromRules) && fromRules >= 1) return fromRules;
  return MAX_HAND_SIZE;
};
