/** Пресет поля ввода: подпись, строка с кнопками по бокам, подсказка и ошибка. */
export default {
  input_root: 'flex flex-col gap-8',
  input_label: 'text-14 text-dim',
  input_row: 'flex w-full items-center gap-8',
  /**
   * Обводка при фокусе — только своя, как при наведении (`border-dim`): голубую рамку глобального
   * `:focus-visible` (`app/assets/styles.css`) поле гасит само. У селектов она остаётся, но у текстового
   * поля читается как вторая рамка поверх коралловой и мешает (решение владельца). `outline-hidden`, а не
   * `outline-none`: в режиме высокой контрастности браузера фокус всё равно виден.
   */
  input_element:
    'w-full min-w-0 rounded-4 border-2 border-line bg-app px-14 py-10 text-16 text-ink transition-colors placeholder:text-dim hover:border-dim focus:border-dim focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line',
  input_hint: 'text-14 text-dim',
  input_error: 'text-14 text-danger',
};
