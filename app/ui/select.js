/** Пресет селекта: триггер, выпадающий список в общем скролле, пункты и галочка выбранного. */
export default {
  select_root: 'relative',
  select_trigger:
    'flex w-full items-center justify-between gap-10 rounded-4 border-2 border-line bg-app px-14 py-10 text-16 text-ink transition-colors hover:border-dim disabled:cursor-not-allowed disabled:opacity-40',
  select_value: 'truncate',
  select_placeholder: 'text-dim',
  select_icon: 'size-16 shrink-0 text-dim transition-transform data-[state=open]:rotate-180',
  select_content:
    'z-50 max-h-320 min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-4 border-2 border-line bg-surface shadow-2xl',
  select_viewport: 'p-4',
  select_item:
    'flex cursor-pointer items-center justify-between gap-10 rounded-2 px-12 py-8 text-16 text-ink outline-none select-none data-[highlighted]:bg-surface-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40',
  select_item_indicator: 'size-16 shrink-0 text-accent',
  select_separator: 'my-4 h-2 bg-line',
};
