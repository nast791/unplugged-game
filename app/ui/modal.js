/**
 * Пресет модалки. Тело всегда кладётся в `AScroll`, поэтому слоты `scroll_*` берутся из пресета `scroll`,
 * а модалка может их переопределить через свой `ui` (так же это работает у селекта, дропдауна и табов).
 */
export default {
  modal_overlay: 'fixed inset-0 z-50 bg-app/80 backdrop-blur-8',
  /**
   * `text-ink` на самой модалке, а не только на заголовке: окно висит на тёмном `bg-surface`, а
   * цвет текста наследуется от `<Body>` (`text-primary`, почти чёрный) — без этого заголовок и любая
   * подпись без своего цвета читались как чёрное по тёмному.
   */
  modal_content:
    'fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-48*var(--spacing))] max-w-720 -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-6 border-2 border-line bg-surface text-ink shadow-2xl',
  modal_header: 'flex items-start justify-between gap-16 p-28 pb-16',
  modal_body: 'flex flex-col gap-20 p-28 pt-0',
  /**
   * Футер — одна строка: сообщение об ошибке уезжает влево (`modal_error`), кнопки остаются справа.
   * Так ошибку видно и при скролле тела, и при длинном тексте — в теле её сдвигало за экран.
   */
  modal_footer: 'flex items-center justify-end gap-12 p-28 pt-16',
  modal_error: 'text-14 text-danger mr-auto',
  modal_close: 'rounded-2 p-6 text-dim transition-colors hover:text-ink',
  modal_title: 'text-26 font-semibold',
  modal_description: 'text-14 text-dim',
};
