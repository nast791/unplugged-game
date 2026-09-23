import gameEnd from './gameEnd.js';
import gameStart from './gameStart.js';
import turn from './turn.js';
import turnEnd from './turnEnd.js';
import turnStart from './turnStart.js';

/** Мигрированные lifecycle-хуки. Core знает только этот реестр. */
export const lifecycleHooks = {
  [gameStart.name]: gameStart,
  [turnStart.name]: turnStart,
  [turn.name]: turn,
  [turnEnd.name]: turnEnd,
  [gameEnd.name]: gameEnd,
};

export const isCoreHook = hookName => hookName in lifecycleHooks;
