import { describe, expect, it } from 'vitest';
import { cn } from '../../../app/utils/cn.js';

/**
 * Инвариант пары preset/ui: правка `ui` домешивается через `cn(пресет, правка)` и обязана **перекрывать**
 * пресет, а не спорить с ним порядком утилит в CSS. Проверяем те группы, где это уже ломалось: `size-*`
 * против `w-*`/`h-*` (плашка героя) и `px-*` варианта кнопки против `px-*` самой кнопки.
 */
describe('cn: правка перекрывает пресет', () => {
  it('размер правкой `w`/`h` снимает квадрат пресета `size-*`', () => {
    const merged = cn(
      'relative flex size-36 shrink-0 rounded-full border-2 border-line bg-surface-2',
      'h-48 w-192 rounded-md border-transparent bg-[var(--hero-color)]',
    );

    expect(merged).not.toContain('size-36');
    expect(merged).not.toContain('rounded-full');
    expect(merged).not.toContain('border-line');
    expect(merged).not.toContain('bg-surface-2');
    expect(merged).toContain('h-48');
    expect(merged).toContain('w-192');
    expect(merged).toContain('rounded-md');
    expect(merged).toContain('border-transparent');
  });

  it('порядок обратный: `size-*` после `w`/`h` побеждает сам (в `cn` выигрывает последний)', () => {
    expect(cn('w-96 h-48', 'size-36')).toBe('size-36');
  });

  it('отступы: правка снимает отступ варианта кнопки', () => {
    const merged = cn('rounded-4 px-20 py-10', 'px-10 py-10', 'px-6');

    expect(merged).not.toContain('px-20');
    expect(merged).not.toContain('px-10');
    expect(merged).toContain('px-6');
  });

  it('наши fluid-утилиты не схлопываются как чужие группы (`text-16` — размер, а не цвет)', () => {
    expect(cn('text-16 text-ink', 'text-14')).toBe('text-ink text-14');
    expect(cn('rounded-2 p-6', 'rounded-4')).toBe('p-6 rounded-4');
  });
});
