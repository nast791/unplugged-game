import { computed, ref } from 'vue';
import {
  DEFAULT_ANIMATION_SPEED,
  animationScale,
  animationSpeed,
  scaledDuration,
} from '~/constants/animation.js';

const STORAGE_KEY = 'unplugged.settings.v1';

const settings = ref(null);

const emptySettings = () => ({ animation: DEFAULT_ANIMATION_SPEED });

const storage = () => (typeof localStorage === 'undefined' ? null : localStorage);

const persist = () => {
  const store = storage();
  if (!store || !settings.value) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(settings.value));
  } catch {}
};

const load = () => {
  if (settings.value) return settings.value;

  let stored = null;
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }

  settings.value = {
    ...emptySettings(),
    ...(stored ?? {}),
    animation: animationSpeed(stored?.animation).id,
  };
  if (!stored) persist();
  return settings.value;
};

const patch = values => {
  load();
  settings.value = { ...settings.value, ...values };
  persist();
};

const animation = computed(() => settings.value?.animation ?? DEFAULT_ANIMATION_SPEED);

const scale = computed(() => animationScale(animation.value));

const duration = name => scaledDuration(name, animation.value);

export const applyAnimationScale = (value = scale.value) => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--anim-scale', String(value));
};

export const useSettings = () => {
  load();

  return {
    settings,
    animation,
    scale,
    duration,
    load,
    applyAnimationScale,
    setAnimation: id => {
      patch({ animation: animationSpeed(id).id });
      applyAnimationScale();
    },
    reset: () => {
      settings.value = emptySettings();
      persist();
      applyAnimationScale();
    },
  };
};

export default useSettings;
