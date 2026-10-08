import { useAppConfig } from '#app';
import { computed, toValue } from 'vue';
import { cn } from '~/utils/cn.js';

/**
 * Концепция preset/ui (`docs/ui-plan.md` §9.4).
 *
 * Компоненты-атомы **безстилевые**: классов в разметке нет, только слоты из пресета —
 * `cn(styles.button, styles.button_primary)`. Пресет приходит из `app/ui/base.js` через `app.config.js`,
 * а точечные правки на месте — через проп `ui` (он домешивается к пресету и проходит через `cn`, поэтому
 * конфликтующие классы заменяются, а не дублируются).
 */
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export const deepMergeUi = (base, patch) => {
  if (!isPlainObject(base) && !isPlainObject(patch)) return patch ?? base;
  const out = { ...(isPlainObject(base) ? base : {}) };
  for (const [key, value] of Object.entries(isPlainObject(patch) ? patch : {})) {
    const prev = out[key];
    out[key] = isPlainObject(prev) && isPlainObject(value) ? deepMergeUi(prev, value) : value;
  }
  return out;
};

/** Слоты пресета, склеенные с локальными правками: `cn(пресет, правка)`. */
export const resolveUiStyles = (defaults = {}, localUi = {}) => {
  const merged = deepMergeUi(defaults, localUi);
  const result = {};
  for (const slot of Object.keys(merged)) {
    result[slot] = cn(defaults[slot], merged[slot]);
  }
  return result;
};

export const useUI = (key, localUi = {}) => {
  const appConfig = useAppConfig();
  const styles = computed(() =>
    resolveUiStyles(appConfig.ui?.[toValue(key)] ?? {}, toValue(localUi) ?? {}),
  );
  return { styles };
};
