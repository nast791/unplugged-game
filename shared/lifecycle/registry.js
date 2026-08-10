import gameStart from './gameStart.js';
import turnStart from './turnStart.js';

/** Мигрированные lifecycle-хуки. Core знает только этот реестр. */
export const lifecycleHooks = {
  [gameStart.name]: gameStart,
  [turnStart.name]: turnStart,
};

export const isCoreHook = hookName => hookName in lifecycleHooks;
