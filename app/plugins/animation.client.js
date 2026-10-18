import { watchEffect } from 'vue';
import { useSettings } from '~/composables/ui/useSettings.js';

export default defineNuxtPlugin(() => {
  const { load, applyAnimationScale, scale } = useSettings();

  load();
  watchEffect(() => applyAnimationScale(scale.value));
});
