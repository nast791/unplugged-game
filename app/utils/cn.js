import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `cn` — единственный способ склеивать классы: `clsx` для условий, `tailwind-merge` для конфликтов.
 *
 * Кастомные утилиты проекта (`app/assets/styles.css`) tailwind-merge не знает — их группы регистрируем
 * руками, иначе он считает `text-16` цветом текста, а `rounded-4` — чужим радиусом, и «схлопывает» верные
 * классы (docs/ui-plan.md §9.1: число в суффиксе — множитель `--spacing`).
 */
const isIntegerToken = value => /^\d+$/.test(value);

const twMerge = extendTailwindMerge({
  extend: {
    /**
     * `size-*` и `w-*`/`h-*` — один и тот же прямоугольник, но tailwind-merge по умолчанию считает их
     * разными группами в одну сторону: `size-36` перебивал `h-48 w-192` из пропа `ui` (в CSS порядок
     * утилит решает не в пользу правки), и размер приходилось помечать `!`. Правим именно конфликт:
     * **правка `ui` обязана перекрывать пресет** — в этом задумка пары preset/ui.
     */
    conflictingClassGroups: {
      w: ['size'],
      h: ['size'],
    },
    classGroups: {
      'dsh-width': ['w-min-content', 'w-max-content'],
      'dsh-font-variant': ['lining-nums'],
      'font-size': [{ text: [isIntegerToken] }],
      'dsh-columns-width': [{ 'columns-w': [isIntegerToken] }],
      'dsh-gap-size': [{ gap: [isIntegerToken] }],
      'dsh-border-width': [{ border: [isIntegerToken] }],
      /**
       * Ширина рамки одной стороны — своя группа у tailwind-merge (`border-w-l` и т. д.), и она тоже
       * считает `border-l-6` цветом: без этих строк правка `ui` не могла бы положить акцентную полоску
       * поверх общей рамки пресета (`border-2 border-line` + `border-l-6 border-l-accent`).
       */
      'dsh-border-width-l': [{ 'border-l': [isIntegerToken] }],
      'dsh-border-width-r': [{ 'border-r': [isIntegerToken] }],
      'dsh-border-width-t': [{ 'border-t': [isIntegerToken] }],
      'dsh-border-width-b': [{ 'border-b': [isIntegerToken] }],
      'dsh-blur': [{ blur: [isIntegerToken] }, { 'backdrop-blur': [isIntegerToken] }],
      'dsh-rounded-all': [{ rounded: [isIntegerToken] }],
      'dsh-rounded-top': [{ 'rounded-t': [isIntegerToken] }],
      'dsh-rounded-bottom': [{ 'rounded-b': [isIntegerToken] }],
      'dsh-rounded-left': [{ 'rounded-l': [isIntegerToken] }],
      'dsh-rounded-right': [{ 'rounded-r': [isIntegerToken] }],
      'dsh-rounded-top-left': [{ 'rounded-tl': [isIntegerToken] }],
      'dsh-rounded-top-right': [{ 'rounded-tr': [isIntegerToken] }],
      'dsh-rounded-bottom-left': [{ 'rounded-bl': [isIntegerToken] }],
      'dsh-rounded-bottom-right': [{ 'rounded-br': [isIntegerToken] }],
    },
  },
});

export const cn = (...inputs) => twMerge(clsx(inputs));
