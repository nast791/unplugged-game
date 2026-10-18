import { computed, getCurrentInstance, onUnmounted, ref, watch } from 'vue';
import { resolveCallback, resolveValue } from '~/composables/ui/useReactiveOptions.js';

const TICK_MS = 250;
const STORAGE_PREFIX = 'unplugged:clock:';

const now = ref(Date.now());
let ticker = null;
let subscribers = 0;

const sync = () => {
  now.value = Date.now();
};

export const syncNow = sync;

const acquire = () => {
  subscribers += 1;
  if (ticker !== null) return;
  ticker = setInterval(sync, TICK_MS);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', sync);
};

const release = () => {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers || ticker === null) return;
  clearInterval(ticker);
  ticker = null;
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', sync);
};

const storage = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

const storageKey = key => `${STORAGE_PREFIX}${key}`;

const storedAt = key => {
  try {
    const value = Number(storage()?.getItem(storageKey(key)));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

const persistAt = (key, value) => {
  if (!key) return;
  try {
    if (value) storage()?.setItem(storageKey(key), String(value));
    else storage()?.removeItem(storageKey(key));
  } catch {}
};

const registry = new Map();

const createState = at => ({ startedAt: ref(at), stoppedAt: ref(0) });

const stateOf = key => {
  if (!key) return createState(0);
  if (!registry.has(key)) registry.set(key, createState(storedAt(key)));
  return registry.get(key);
};

export const markClock = (key, at = Date.now()) => {
  const state = stateOf(String(key));
  state.startedAt.value = at;
  state.stoppedAt.value = 0;
  persistAt(String(key), at);
  sync();
  return at;
};

export const ensureClock = (key, at = Date.now()) => {
  const started = stateOf(String(key)).startedAt.value;
  return started || markClock(key, at);
};

export const clearClock = key => {
  const state = stateOf(String(key));
  state.startedAt.value = 0;
  state.stoppedAt.value = 0;
  persistAt(String(key), 0);
  sync();
};

export const clockStartedAt = key => stateOf(String(key)).startedAt.value;

export const formatElapsed = ms => {
  const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours ? `${hours}:${tail}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const useClock = (options = {}) => {
  const key = options.key ? String(options.key) : '';
  const mode = options.mode === 'down' ? 'down' : 'up';
  const persist = options.persist ?? Boolean(key);
  const state = stateOf(persist ? key : '');
  const limitMs = () => Math.max(0, Number(resolveValue(options.limit)) || 0);

  acquire();
  if (getCurrentInstance()) onUnmounted(release);

  const start = (at = Date.now()) => {
    state.startedAt.value = at;
    state.stoppedAt.value = 0;
    persistAt(persist ? key : '', at);
    sync();
    return at;
  };

  const stop = () => {
    if (!state.startedAt.value || state.stoppedAt.value) return;
    state.stoppedAt.value = Date.now();
    sync();
  };

  const restart = () => start();

  const reset = () => {
    state.startedAt.value = 0;
    state.stoppedAt.value = 0;
    persistAt(persist ? key : '', 0);
    sync();
  };

  const started = computed(() => state.startedAt.value > 0);
  const elapsed = computed(() => {
    const from = state.startedAt.value;
    if (!from) return 0;
    const to = state.stoppedAt.value || now.value;
    return Math.max(0, to - from);
  });
  const remaining = computed(() => Math.max(0, limitMs() - elapsed.value));
  const expired = computed(() => mode === 'down' && limitMs() > 0 && remaining.value === 0);
  const running = computed(
    () => state.startedAt.value > 0 && !state.stoppedAt.value && !expired.value,
  );
  const value = computed(() => (mode === 'down' ? remaining.value : elapsed.value));
  const seconds = computed(() => Math.ceil(value.value / 1000));
  const label = computed(() => formatElapsed(value.value));

  const onExpire = resolveCallback(options.onExpire);
  if (onExpire) {
    watch(expired, (yes, before) => {
      if (yes && !before) onExpire();
    });
  }

  return {
    key,
    mode,
    startedAt: computed(() => state.startedAt.value),
    started,
    running,
    elapsed,
    remaining,
    value,
    seconds,
    label,
    expired,
    limitMs,
    start,
    stop,
    restart,
    reset,
  };
};

export default useClock;
