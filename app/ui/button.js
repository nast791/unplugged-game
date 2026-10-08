/** Пресет кнопки: слоты `button*`. Вариант подставляется как `button_<variant>`. */
export default {
  button:
    'inline-flex items-center justify-center gap-8 rounded-4 border-2 border-transparent px-20 py-10 text-16 font-medium transition-colors select-none disabled:cursor-not-allowed disabled:opacity-40',
  button_primary: 'bg-accent text-app hover:bg-accent-hover',
  button_secondary: 'border-line bg-surface/70 text-ink hover:border-dim',
  button_ghost: 'text-dim hover:text-ink',
  button_menu:
    'border-line/60 text-ink/80 hover:border-accent hover:bg-accent hover:text-app focus-visible:border-accent focus-visible:bg-accent focus-visible:text-app h-52 py-0 w-full',
  button_danger: 'bg-danger text-app hover:opacity-90',
  button_icon: 'px-10 py-10',
  button_block: 'w-full',
  button_loading: 'pointer-events-none',
  spinner: 'size-18 shrink-0 animate-spin rounded-full border-4 border-line border-t-accent',
};
