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
import { useUI } from '~/composables/ui/useUI';
import { cn } from '~/ui/cn.js';

const negateMinWidthMedia = list => {
  const parts = list
    .filter(Boolean)
    .map(media =>
      media.replace(
        /\(min-width:\s*([\d.]+)px\)/g,
        (_, px) => `(max-width: ${Number(px) - 0.02}px)`,
      ),
    );

  return parts.length ? parts.join(' and ') : undefined;
};

defineOptions({ inheritAttrs: false });

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  width: { type: [Number, String], default: undefined },
  height: { type: [Number, String], default: undefined },

  densities: { type: Array, default: () => [1, 2] },
  preload: { type: Boolean, default: false },

  loading: { type: String, default: '' },
  modifiers: { type: Object, default: () => ({}) },
  preset: { type: String, default: 'picture' },
  ui: { type: Object, default: () => ({}) },
});

const BREAKPOINT_SRC = /^([a-z0-9-]+):src$/;

const attrs = useAttrs();
const appConfig = useAppConfig();
const img = useImage();

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const pictureClass = computed(() => cn(styles.value.picture_root, attrs.class));

const rootAttrs = computed(() => {
  const rest = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (!BREAKPOINT_SRC.test(key)) rest[key] = value;
  }
  return rest;
});

const url = (value, extra = {}) => img(value, { ...props.modifiers, ...extra });

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
