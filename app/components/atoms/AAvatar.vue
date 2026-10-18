<template>
  <AvatarRoot v-bind="restAttrs" :class="avatarClass">
    <AvatarImage v-if="props.src" :class="styles.avatar_image" :src="props.src" :alt="props.alt" />

    <AvatarFallback :class="styles.avatar_fallback" :delay-ms="props.delayMs">
      <slot name="fallback">
        <Icon v-if="props.icon" :name="props.icon" :class="styles.avatar_icon" aria-hidden="true" />
        <span v-else class="text-16">{{ initials }}</span>
      </slot>
    </AvatarFallback>
  </AvatarRoot>
</template>

<script setup>
import { AvatarFallback, AvatarImage, AvatarRoot } from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';
import { cn } from '~/ui/cn.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  icon: { type: String, default: '' },

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
