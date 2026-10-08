<template>
  <picture v-bind="rootAttrs" :class="pictureClass">
    <source
      v-for="entry in sources"
      :key="entry.media"
      :media="entry.media"
      :srcset="entry.srcset"
    />

    <img
      :class="styles.picture_img"
      :src="fallback.src"
      :srcset="fallback.srcset"
      :width="props.width || undefined"
      :height="props.height || undefined"
      :alt="props.alt"
      :loading="loadingAttr"
      :decoding="decodingAttr"
      :fetchpriority="props.preload ? 'high' : undefined"
    />
  </picture>
</template>

<script setup>
/**
 * Свой кадр на брейкпоинт: `lg:src="/wide.webp"`. Широкие идут первыми — `<picture>` берёт первый
 * подошедший `<source>`, поэтому на большом экране победит `lg:src`, а не базовый `src`.
 */
import { useUI } from '~/composables/ui/useUI';
import { negateMinWidthMedia } from '~/utils/pictureMedia';

/**
 * Картинка проекта: `<picture>` с art-direction по брейкпоинтам и honest-прелоадом.
 *
 * - растровые файлы у нас **всегда WebP**, поэтому пропов формата нет: `@nuxt/image` отдаёт источник как
 *   есть, а `NuxtPicture` с конвертацией нам не нужен — нужен контроль над `<source media>`;
 * - `preload` вешает `<link rel="preload" as="image" media="…">` на каждый кадр, поэтому браузер
 *   действительно тянет **только тот, что подходит текущему разрешению** (и не тянет остальные);
 * - по умолчанию `loading="lazy"`, `preload` переводит кадр в `eager` со `decoding="sync"`.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  width: { type: [Number, String], default: undefined },
  height: { type: [Number, String], default: undefined },
  /** Плотности для retina, когда задана ширина: `[1, 2]` → в srcset попадут 1x и 2x. */
  densities: { type: Array, default: () => [1, 2] },
  preload: { type: Boolean, default: false },
  /** Перебивает `loading` вручную: `lazy` (по умолчанию) или `eager`. */
  loading: { type: String, default: '' },
  modifiers: { type: Object, default: () => ({}) },
  preset: { type: String, default: 'picture' },
  ui: { type: Object, default: () => ({}) },
});

/** Атрибут брейкпоинта: `lg:src`, `md:src`, `sm:src` — имя экрана из `ui.screens`. */
const BREAKPOINT_SRC = /^([a-z0-9-]+):src$/;

const attrs = useAttrs();
const appConfig = useAppConfig();
const img = useImage();

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const pictureClass = computed(() => cn(styles.value.picture_root, attrs.class));

/** Всё, кроме брейкпоинтовых `src`, уходит на `<picture>`: id, data-*, aria-*. */
const rootAttrs = computed(() => {
  const rest = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (!BREAKPOINT_SRC.test(key)) rest[key] = value;
  }
  return rest;
});

const url = (value, extra = {}) => img(value, { ...props.modifiers, ...extra });

/** Когда у кадра есть ширина, отдаём srcset с плотностями — иначе хватит одного URL. */
const srcset = (value, extra = {}) => {
  const modifiers = { ...props.modifiers, ...extra };
  if (!value || !modifiers.width) return url(value, extra);
  return img.getSizes(value, { modifiers, densities: props.densities.join(' ') }).srcset;
};

const sources = computed(() => {
  const screens = appConfig.ui?.screens ?? {};
  const entries = [];

  for (const [key, value] of Object.entries(attrs)) {
    const match = BREAKPOINT_SRC.exec(key);
    if (!match || typeof value !== 'string' || !value) continue;

    const screen = screens[match[1]];
    if (!screen) {
      if (import.meta.dev) {
        console.warn(
          `APicture: неизвестный брейкпоинт "${match[1]}" в "${key}" — нет в ui.screens`,
        );
      }
      continue;
    }

    entries.push({
      media: `(min-width: ${screen})`,
      src: url(value),
      srcset: srcset(value),
      order: Number.parseFloat(screen),
    });
  }

  return entries.sort((left, right) => right.order - left.order);
});

const fallback = computed(() => ({ src: url(props.src), srcset: srcset(props.src) }));

const loadingAttr = computed(() => props.loading || (props.preload ? 'eager' : 'lazy'));
const decodingAttr = computed(() => (loadingAttr.value === 'eager' ? 'sync' : 'async'));

/** Прелоад: у каждого кадра свой `media`, поэтому лишние разрешения браузер не тянет. */
const preloadLinks = computed(() => {
  if (!props.preload || !props.src) return [];

  const entries = [
    ...sources.value,
    { ...fallback.value, media: negateMinWidthMedia(sources.value.map(entry => entry.media)) },
  ];

  return entries.map(({ media, src, srcset: imagesrcset }) => ({
    rel: 'preload',
    as: 'image',
    media,
    href: src,
    imagesrcset,
    fetchpriority: 'high',
  }));
});

useHead(() => ({ link: preloadLinks.value }));

defineExpose({ sources, fallback });
</script>
