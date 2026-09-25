/**
 * Подстановка $переменных в параметры правил и действий.
 *
 * Переменные появляются только из `var` в условиях правила, поэтому неизвестная переменная — ошибка,
 * а не тихая пустая подстановка: иначе правило молча сработало бы не с тем игроком или не с той картой.
 */
export const resolveVars = (value, vars = {}) => {
  if (typeof value === 'string') {
    if (!value.startsWith('$')) return value;

    const name = value.slice(1);
    if (!(name in vars)) {
      throw new Error(`vars: переменная "$${name}" не задана в условиях правила`);
    }
    return vars[name];
  }

  if (Array.isArray(value)) return value.map(entry => resolveVars(entry, vars));

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveVars(entry, vars),
      ]),
    );
  }

  return value;
};

export default resolveVars;
