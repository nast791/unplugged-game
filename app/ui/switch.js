/** Пресет переключателя: одно булево значение, подпись — проп `label` или слот. */
export default {
  switch_wrapper: 'inline-flex cursor-pointer items-center gap-10',
  switch_root:
    'relative inline-flex h-24 w-44 shrink-0 cursor-pointer items-center rounded-full border-2 border-line bg-app transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40',
  switch_thumb:
    'block size-16 translate-x-3 rounded-full bg-dim transition-transform data-[state=checked]:translate-x-23 data-[state=checked]:bg-accent',
  switch_label: 'text-16 text-ink select-none',
};
