<template>
  <div :class="styles.input_root">
    <label v-if="props.label || $slots.label" :for="inputId" :class="styles.input_label">
      <slot name="label">{{ props.label }}</slot>
    </label>

    <div :class="styles.input_row">
      <slot name="prev" :focus="focus" :clear="clear" />

      <input
        :id="inputId"
        ref="inputRef"
        :value="model"
        v-bind="restAttrs"
        :type="props.type"
        :class="styles.input_element"
        :placeholder="props.placeholder || undefined"
        :disabled="props.disabled"
        :readonly="props.readonly"
        :maxlength="props.maxlength || undefined"
        :inputmode="props.inputmode || (props.numeric ? 'numeric' : undefined)"
        :autocomplete="props.autocomplete"
        :aria-invalid="props.error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="onInput"
      />

      <slot name="next" :focus="focus" :clear="clear" />
    </div>

    <p v-if="props.error" :id="errorId" :class="styles.input_error" role="alert">
      <slot name="error">{{ props.error }}</slot>
    </p>
    <p v-else-if="props.hint || $slots.hint" :id="hintId" :class="styles.input_hint">
      <slot name="hint">{{ props.hint }}</slot>
    </p>
  </div>
</template>

<script setup>
/**
 * Универсальное поле ввода — единственный `<input>` в проекте (как `AScroll` для скролла): подпись,
 * подсказка и ошибка, слоты `prev`/`next` для кнопок рядом (например «случайный сид»), режим `numeric`
 * для числовых полей.
 *
 * Значение — **строка** и всегда через `v-model`: `numeric` фильтрует ввод по цифрам, поэтому ввод
 * обрабатывается вручную (`:value` + `@input`), а не `v-model` на самом `<input>` — иначе два обработчика
 * `input` спорили бы за одно значение. Приведение к числу — забота потребителя: пустая строка значит
 * «не задано», а не ноль.
 *
 * `error` и `hint` связаны с полем через `aria-describedby`: ошибка важнее подсказки, показывается одна.
 */
defineOptions({ inheritAttrs: false });

import { useUI } from '~/composables/ui/useUI';

const props = defineProps({
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  /** Только цифры: сид партии, размер поля — всё, что набирают с цифровой панели. */
  numeric: { type: Boolean, default: false },
  maxlength: { type: [Number, String], default: 0 },
  autocomplete: { type: String, default: 'off' },
  inputmode: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  autofocus: { type: Boolean, default: false },
  preset: { type: String, default: 'input' },
  ui: { type: Object, default: () => ({}) },
});

const model = defineModel({ type: String, default: '' });

const attrs = useAttrs();
const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const inputId = useId();
const hintId = `${inputId}-hint`;
const errorId = `${inputId}-error`;
const inputRef = ref(null);

/** Что описывает поле: ошибка важнее подсказки — читаем одну. */
const describedBy = computed(() => {
  if (props.error) return errorId;
  if (props.hint) return hintId;
  return undefined;
});

const restAttrs = computed(() => {
  const { class: className, ...rest } = attrs;
  return rest;
});

const onInput = event => {
  const raw = event.target.value;
  const value = props.numeric ? raw.replace(/\D+/g, '') : raw;
  // Отфильтрованное возвращаем в само поле: значение связывается вручную, `v-model` ввод не правит.
  if (value !== raw) event.target.value = value;
  model.value = value;
};

const clear = () => {
  model.value = '';
  focus();
};

const focus = () => inputRef.value?.focus();

onMounted(() => {
  if (props.autofocus) focus();
});

defineExpose({ focus, clear, inputRef });
</script>
