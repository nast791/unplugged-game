import gameStart from './gameStart.js';

/** Мигрированные lifecycle-хуки. Core знает только этот реестр. */
export const lifecycleHooks = {
  [gameStart.name]: gameStart,
};

export const isCoreHook = hookName => hookName in lifecycleHooks;
