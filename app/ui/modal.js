export default {
  modal_overlay: 'fixed inset-0 z-50 bg-app/80 backdrop-blur-8',
  modal_content:
    'fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-48*var(--spacing))] max-w-720 -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-6 border-2 border-line bg-surface text-ink shadow-2xl',
  modal_header: 'flex items-start justify-between gap-16 p-24 pb-16',
  modal_body: 'flex flex-col gap-20 p-24 pt-0',
  modal_footer: 'flex items-center justify-end gap-12 p-24 pt-16',
  modal_error: 'text-16 text-danger mr-auto',
  modal_close:
    'rounded-2 -translate-y-8 translate-x-12 p-6 text-dim transition-colors hover:text-ink flex',
  modal_title: 'text-26 font-semibold uppercase tracking-[0.02em]',
  modal_description: 'text-16 text-dim',
};
