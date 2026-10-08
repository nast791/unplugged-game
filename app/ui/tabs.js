/** Пресет табов: список кнопок, содержимое — именованные слоты по `id` вкладки. */
export default {
  tabs_root: 'flex min-h-0 flex-col gap-12',
  tabs_list: 'flex flex-wrap gap-4 rounded-4 border-2 border-line bg-surface/60 p-4',
  tabs_trigger:
    'cursor-pointer rounded-2 px-16 py-8 text-16 text-dim transition-colors hover:text-ink data-[state=active]:bg-surface-2 data-[state=active]:text-ink',
  tabs_content: 'flex min-h-0 flex-1 flex-col',
};
