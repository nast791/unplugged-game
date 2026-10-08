/**
 * Подстановка $переменных в параметры правил и действий.
 *
 * Переменные появляются только из `var` в условиях правила, поэтому неизвестная переменная — ошибка,
 * а не тихая пустая подстановка: иначе правило молча сработало бы не с тем игроком или не с той картой.
 * Исключение — служебный транзиент `$remembered.<ключ>[.<поле>]` (его пишет `SET_CARDS { remember }`):
 * значение берётся из `state._remember`, а если карта не запомнена — отдаётся `MISSING`, и шаг правила
 * с таким параметром не выполняется вовсе (`shared/rules/run.js`). Транзиент передаёт только слой
 * правил: для остальных вызовов (факты, бот) `$remembered` — обычная неизвестная переменная.
 */

/** Метка «значения нет»: действие, в чьи параметры она попала, не выполняется. */
export const MISSING = Symbol('vars:missing');

/** Есть ли в подставленных параметрах MISSING (слой правил по ней пропускает шаг). */
export const hasMissing = value => {
  if (value === MISSING) return true;
  if (Array.isArray(value)) return value.some(entry => hasMissing(entry));
  if (value && typeof value === 'object') {
    return Object.values(value).some(entry => hasMissing(entry));
  }
  return false;
};

/** Значение транзиента; `undefined` — имя не про него, и переменная остаётся неизвестной. */
const rememberedValue = (name, context) => {
  const [head, ...path] = name.split('.');
  if (head !== 'remembered' || !('remembered' in context)) return undefined;

  let entry = context.remembered;
  for (const key of path) {
    entry = entry == null ? undefined : entry[key];
  }
  return entry == null ? MISSING : entry;
};

export const resolveVars = (value, vars = {}, context = {}) => {
  if (typeof value === 'string') {
    if (!value.startsWith('$')) return value;

    const name = value.slice(1);
    if (name in vars) return vars[name];

    const remembered = rememberedValue(name, context);
    if (remembered !== undefined) return remembered;

    throw new Error(`vars: переменная "$${name}" не задана в условиях правила`);
  }

  if (Array.isArray(value)) return value.map(entry => resolveVars(entry, vars, context));

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveVars(entry, vars, context)]),
    );
  }

  return value;
};

export default resolveVars;
