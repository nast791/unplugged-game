import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import {
  clearClock,
  clockStartedAt,
  ensureClock,
  formatElapsed,
  markClock,
  syncNow,
  useClock,
} from '../../../app/composables/ui/useClock.js';

/**
 * Счётчик считает **от отметки времени**, поэтому проверяется сдвигом системного времени и `syncNow()`:
 * значение — чистая функция от `Date.now()` и отметки, а тик только перерисовывает показ.
 *
 * `sessionStorage` в тестовой среде (`environment: 'node'`) нет — подставляем свой, иначе раздельное
 * хранение проверить нечем.
 */
const store = () => {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
};

const T0 = Date.parse('2026-01-01T00:00:00Z');

describe('useClock', () => {
  let session;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T0));
    session = store();
    globalThis.sessionStorage = session;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.sessionStorage;
  });

  it('от нуля: считает вверх от отметки', async () => {
    const clock = useClock({ mode: 'up' });
    clock.start();

    // Пять секунд «пропали» в фоне: тиков не было, а показание всё равно верное.
    vi.setSystemTime(T0 + 5000);
    syncNow();
    await nextTick();

    expect(clock.label.value).toBe('0:05');
    expect(clock.seconds.value).toBe(5);
    expect(clock.elapsed.value).toBe(5000);
    expect(clock.running.value).toBe(true);
    expect(clock.expired.value).toBe(false);
  });

  it('к нулю: показывает остаток от лимита', async () => {
    const clock = useClock({ mode: 'down', limit: 90_000 });
    clock.start();

    vi.setSystemTime(T0 + 5000);
    syncNow();
    await nextTick();

    expect(clock.label.value).toBe('1:25');
    expect(clock.remaining.value).toBe(85_000);
  });

  it('к нулю: истекает один раз и зовёт onExpire', async () => {
    const onExpire = vi.fn();
    const clock = useClock({ mode: 'down', limit: 3000, onExpire });
    clock.start();

    vi.setSystemTime(T0 + 3000);
    syncNow();
    await nextTick();

    expect(clock.expired.value).toBe(true);
    expect(clock.running.value).toBe(false);
    expect(clock.remaining.value).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);

    vi.setSystemTime(T0 + 8000);
    syncNow();
    await nextTick();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('без лимита (0) счётчик к нулю не идёт и не истекает', async () => {
    const onExpire = vi.fn();
    const clock = useClock({ mode: 'down', limit: 0, onExpire });

    clock.start();
    vi.setSystemTime(T0 + 5000);
    syncNow();
    await nextTick();

    expect(clock.expired.value).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('перезапуск начинает отсчёт заново и снимает истечение', async () => {
    const clock = useClock({ mode: 'down', limit: 2000 });
    clock.start();

    vi.setSystemTime(T0 + 2000);
    syncNow();
    await nextTick();
    expect(clock.expired.value).toBe(true);

    clock.restart();
    await nextTick();

    expect(clock.expired.value).toBe(false);
    expect(clock.running.value).toBe(true);
    expect(clock.seconds.value).toBe(2);
  });

  it('лимит из настроек: пока лимита нет — не идёт, появился — идёт с новым значением', async () => {
    const limit = ref(0);
    const clock = useClock({ mode: 'down', limit: () => limit.value });

    clock.start();
    expect(clock.expired.value).toBe(false);
    expect(clock.remaining.value).toBe(0);

    limit.value = 60_000;
    await nextTick();

    expect(clock.label.value).toBe('1:00');
    expect(clock.expired.value).toBe(false);
  });

  it('хранит отметку под своим именем: счётчики не перетирают друг друга и переживают перезагрузку', async () => {
    markClock('party:placement');
    vi.setSystemTime(T0 + 10_000);
    markClock('party:play');

    expect(session.dump()).toEqual({
      'unplugged:clock:party:placement': String(T0),
      'unplugged:clock:party:play': String(T0 + 10_000),
    });

    // «Перезагрузка»: счётчик с другим именем читает свою отметку из хранилища, а не чужую.
    const restored = useClock({ key: 'party:play', mode: 'up' });
    await nextTick();
    expect(restored.started.value).toBe(true);
    expect(restored.label.value).toBe('0:00');

    const placement = useClock({ key: 'party:placement', mode: 'down', limit: 60_000 });
    await nextTick();
    expect(placement.remaining.value).toBe(50_000);
  });

  it('ensureClock ставит отметку один раз, clearClock снимает её', () => {
    const first = ensureClock('party:play');

    vi.setSystemTime(T0 + 30_000);
    expect(ensureClock('party:play')).toBe(first);
    expect(clockStartedAt('party:play')).toBe(first);

    clearClock('party:play');
    expect(clockStartedAt('party:play')).toBe(0);
    expect(session.dump()['unplugged:clock:party:play']).toBeUndefined();
  });

  it('остановка замораживает показание', async () => {
    const clock = useClock({ mode: 'up' });
    clock.start();
    vi.setSystemTime(T0 + 2000);
    syncNow();
    await nextTick();
    clock.stop();

    vi.setSystemTime(T0 + 7000);
    syncNow();
    await nextTick();

    expect(clock.elapsed.value).toBe(2000);
    expect(clock.running.value).toBe(false);
  });

  it('формат: до часа «M:SS», от часа — «H:MM:SS»', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(-100)).toBe('0:00');
  });
});
