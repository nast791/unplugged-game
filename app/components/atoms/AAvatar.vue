<template>
  <AvatarRoot v-bind="restAttrs" :class="avatarClass">
    <AvatarImage v-if="props.src" :class="styles.avatar_image" :src="props.src" :alt="props.alt" />

    <AvatarFallback :class="styles.avatar_fallback" :delay-ms="props.delayMs">
      <slot name="fallback">
        <Icon v-if="props.icon" :name="props.icon" :class="styles.avatar_icon" aria-hidden="true" />
        <span v-else class="text-14">{{ initials }}</span>
      </slot>
    </AvatarFallback>
  </AvatarRoot>
</template>

<script setup>
import { AvatarFallback, AvatarImage, AvatarRoot } from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';

/**
 * Аватар: картинка с запасным вариантом — иконка-знак или инициалы из `alt`.
 *
 * Остальные атрибуты уходят на корень (`v-bind="restAttrs"`): так аватару передают `style` — например
 * цвет героя переменной (`:style="{ '--hero-color': … }"` и `bg-[var(--hero-color)]` у пресета).
 */
defineOptions({ inheritAttrs: false });

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  icon: { type: String, default: '' },
  /**
   * Только `undefined` разрешает фолбэк: reka-ui на `0` заводит `canRender = false` и не поднимает его,
   * аватар остаётся пустым кругом.
   */
  delayMs: { type: Number, default: undefined },
  preset: { type: String, default: 'avatar' },
  ui: { type: Object, default: () => ({}) },
});

const attrs = useAttrs();
const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

const initials = computed(() =>
  props.alt
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join(''),
);

const avatarClass = computed(() => cn(styles.value.avatar_root, attrs.class));

const restAttrs = computed(() => {
  const { class: className, ...rest } = attrs;
  return rest;
});
</script>
