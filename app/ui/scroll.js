/** Пресет скролла: применяется везде, в том числе внутри других атомов (модалка, селект, дропдаун). */
export default {
  scroll_root: 'relative flex min-h-0 flex-1 flex-col overflow-hidden',
  scroll_viewport: 'size-full overscroll-contain',
  scrollbar_y: 'm-2 flex w-6 justify-center rounded-8 bg-app/40 transition-colors',
  thumb_y: 'relative w-full! rounded-8 bg-dim/50 transition-colors hover:bg-dim',
  scrollbar_x: 'm-2 flex h-6 items-center rounded-8 bg-app/40 transition-colors',
  thumb_x: 'relative h-full! rounded-8 bg-dim/50 transition-colors hover:bg-dim',
  scroll_corner: '',
};
