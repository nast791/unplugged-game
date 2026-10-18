// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANIMATION_DURATIONS,
  ANIMATION_SPEEDS,
  DEFAULT_ANIMATION_SPEED,
  animationScale,
  animationSpeed,
  scaledDuration,
} from '../../../app/constants/animation.js';

const { applyAnimationScale, useSettings } =
  await import('../../../app/composables/ui/useSettings.js');

/**
 * Скорость анимации: словарь длительностей (`app/constants/animation.js`) и настройка поверх него
 * (`app/composables/ui/useSettings.js`). Числа живут в одном словаре, потому что их не сравнить между
 * собой, пока они разбросаны по компонентам, а игрок просит ровно одно — «быстро / средне / медленно».
 *
 * Проверяем три вещи: множители пресетов, что длительность считается от базы с этим множителем, и что
 * выбор переживает перезагрузку (`localStorage`).
 */

const STORAGE_KEY = 'unplugged.settings.v1';

beforeEach(() => {
  localStorage.clear();
  useSettings().reset();
});

describe('словарь длительностей и пресеты скорости', () => {
  it('пресеты идут от медленного к быстрому, «средне» — единица', () => {
    expect(ANIMATION_SPEEDS.map(entry => entry.id)).toEqual(['slow', 'medium', 'fast']);
    expect(ANIMATION_SPEEDS.map(entry => entry.title)).toEqual(['Медленно', 'Средне', 'Быстро']);
    expect(animationScale('medium')).toBe(1);
    expect(animationScale('fast')).toBeLessThan(1);
    expect(animationScale('slow')).toBeGreaterThan(1);
    expect(DEFAULT_ANIMATION_SPEED).toBe('medium');
  });

  it('неизвестная скорость считается средней — «совсем без анимации» не бывает', () => {
    expect(animationSpeed('turbo').id).toBe('medium');
    expect(animationSpeed(null).id).toBe('medium');
    // нижняя граница: даже «быстро» оставляет паузы, иначе процесс боя не читается
    expect(animationScale('fast')).toBeGreaterThan(0);
  });

  it('длительность считается от базовой и множителя', () => {
    const base = ANIMATION_DURATIONS.battleStep;
    expect(scaledDuration('battleStep', 'medium')).toBe(base);
    expect(scaledDuration('battleStep', 'fast')).toBe(Math.round(base * animationScale('fast')));
    expect(scaledDuration('battleStep', 'slow')).toBeGreaterThan(base);
    expect(scaledDuration('battleStep', 'turbo')).toBe(base);
  });

  it('в словаре только паузы показа — время счёта компьютера и тик часов сюда не входят', () => {
    expect(Object.keys(ANIMATION_DURATIONS).sort()).toEqual([
      'aiPause',
      'battleDamage',
      'battleReveal',
      'battleStep',
      'cardFlight',
      'damageFloat',
    ]);
  });
});

describe('настройка скорости', () => {
  it('по умолчанию «средне» и базовая длительность', () => {
    const { animation, scale, duration } = useSettings();

    expect(animation.value).toBe('medium');
    expect(scale.value).toBe(1);
    expect(duration('battleStep')).toBe(ANIMATION_DURATIONS.battleStep);
  });

  it('выбор сохраняется и переживает перезагрузку', async () => {
    const { setAnimation, duration } = useSettings();
    setAnimation('slow');

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).animation).toBe('slow');
    expect(duration('battleStep')).toBeGreaterThan(ANIMATION_DURATIONS.battleStep);

    vi.resetModules();
    const fresh = await import('../../../app/composables/ui/useSettings.js');
    expect(fresh.useSettings().animation.value).toBe('slow');
  });

  it('в хранилище мог остаться пресет, которого больше нет — берём средний', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ animation: 'ultra' }));
    vi.resetModules();
    const fresh = await import('../../../app/composables/ui/useSettings.js');

    expect(fresh.useSettings().animation.value).toBe('medium');
  });

  it('множитель уходит в CSS-переменную — её читают анимации в styles.css', () => {
    applyAnimationScale(1.6);
    expect(document.documentElement.style.getPropertyValue('--anim-scale')).toBe('1.6');

    useSettings().setAnimation('fast');
    expect(document.documentElement.style.getPropertyValue('--anim-scale')).toBe('0.6');
  });
});
