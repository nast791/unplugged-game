/** Пресет радиокнопки: живёт внутри `ARadioGroup` (требование reka-ui). */
export default {
  radio_item:
    'flex cursor-pointer items-center gap-10 text-16 text-ink select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40',
  radio_control:
    'flex size-20 shrink-0 items-center justify-center rounded-full border-2 border-line bg-app transition-colors data-[state=checked]:border-accent',
  radio_indicator: 'size-10 rounded-full bg-accent',
};
