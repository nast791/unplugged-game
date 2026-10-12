import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const isIntegerToken = value => /^\d+$/.test(value);

const twMerge = extendTailwindMerge({
  extend: {
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
