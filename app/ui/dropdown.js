/** Пресет дропдауна: меню профиля и любые контекстные меню, содержимое — в общем скролле. */
export default {
  dropdown_root: 'relative',
  dropdown_content:
    'z-50 flex max-h-480 min-w-200 flex-col overflow-hidden rounded-4 border-2 border-line bg-surface p-4 shadow-2xl',
  dropdown_item:
    'flex cursor-pointer items-center gap-12 rounded-2 px-12 py-8 text-16 text-ink outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-app data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40',
  dropdown_item_icon: 'size-18 shrink-0 opacity-70',
  dropdown_separator: 'my-6 h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent',
  dropdown_label: 'px-12 py-6 text-center text-15 font-medium text-ink',
};
