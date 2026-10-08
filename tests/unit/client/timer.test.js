import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useTimer } from '../../../app/composables/useTimer.js';

/**
 * Таймер считает от **метки дедлайна**, поэтому проверяется сдвигом системного времени: тик только
 * пересчитывает показ, а истечение видно и без него (`visibilitychange` делает то же самое).
 */
describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('без лимита (0) таймер не идёт и не истекает', () => {
    const onExpire = vi.fn();
    const timer = useTimer({ duration: 0, onExpire });

    timer.start();
    vi.advanceTimersByTime(5000);

    expect(timer.running.value).toBe(false);
    expect(timer.expired.value).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('показывает остаток от дедлайна, а не от числа тиков', async () => {
    const timer = useTimer({ duration: 90_000, tickMs: 250 });
    timer.start();

    // Пять секунд «пропали» в фоне: тиков не было, а показание всё равно верное.
    vi.setSystemTime(Date.now() + 5000);
    vi.advanceTimersByTime(250);
    await nextTick();

    expect(timer.label.value).toBe('1:25');
    expect(timer.seconds.value).toBe(85);
    expect(timer.running.value).toBe(true);
  });

  it('истекает один раз и зовёт onExpire', async () => {
    const onExpire = vi.fn();
    const timer = useTimer({ duration: 3000, tickMs: 250, onExpire });
    timer.start();

    vi.advanceTimersByTime(3000);
    await nextTick();

    expect(timer.expired.value).toBe(true);
    expect(timer.running.value).toBe(false);
    expect(timer.remaining.value).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('перезапуск начинает отсчёт заново и снимает истечение', async () => {
    const timer = useTimer({ duration: 2000, tickMs: 250 });
    timer.start();
    vi.advanceTimersByTime(2000);
    await nextTick();
    expect(timer.expired.value).toBe(true);

    timer.restart();
    await nextTick();
    expect(timer.expired.value).toBe(false);
    expect(timer.running.value).toBe(true);
    expect(timer.seconds.value).toBe(2);
  });

  it('лимит из настроек: пока лимита нет — стоим, появился — идём с новым значением', async () => {
    const limit = ref(0);
    const timer = useTimer({ duration: () => limit.value, tickMs: 250 });

    timer.start();
    expect(timer.running.value).toBe(false);

    limit.value = 60_000;
    await nextTick();

    expect(timer.running.value).toBe(true);
    expect(timer.label.value).toBe('1:00');
  });
});
