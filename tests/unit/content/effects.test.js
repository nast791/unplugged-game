import { describe, expect, it } from 'vitest';
import { rules } from '#shared/constants/rules.js';
import {
  EFFECTS,
  EFFECT_IDS,
  effectsNoticeText,
  persistentEffectsOf,
} from '#shared/constants/effects.js';

/**
 * Постоянные эффекты на героя — не боевые статусы: эффект действует, пока включён, и показывается только
 * у того, на кого действует. Реестр проверяем на полноту и на два случая, которые уже есть в игре:
 * сниженный лимит руки и включённое умение Снежной королевы.
 */
describe('реестр постоянных эффектов', () => {
  const base = rules.maxHandSize;

  it('у каждой записи есть id, название, условие и текст для подсказки', () => {
    for (const id of EFFECT_IDS) {
      const effect = EFFECTS[id];

      expect(effect.id, id).toBe(id);
      expect(effect.title.length, id).toBeGreaterThan(0);
      expect(typeof effect.active, id).toBe('function');
      expect(typeof effect.describe, id).toBe('function');
    }
    // иконок в реестре нет намеренно: у гекса один круг на все эффекты (решение владельца)
    expect(EFFECTS.handLimit).not.toHaveProperty('icon');
  });

  it('сниженный лимит руки — эффект, обычный — нет', () => {
    expect(persistentEffectsOf({ handLimit: base - 2 })).toEqual([
      {
        id: 'handLimit',
        title: 'Лимит руки снижен',
        text: `Снижен лимит карт в руке до ${base - 2}`,
      },
    ]);
    // без понижения эффекта нет: ни круга у гекса, ни строки «Важно!»
    expect(persistentEffectsOf({})).toEqual([]);
    expect(persistentEffectsOf({ handLimit: base })).toEqual([]);
    expect(persistentEffectsOf({ handLimit: base - 2 }, { baseHandLimit: base - 2 })).toEqual([]);
    expect(persistentEffectsOf(null)).toEqual([]);
  });

  it('включённое умение — эффект, название берётся из пака героя', () => {
    expect(persistentEffectsOf({ skillActive: true, skill: { title: 'Вечная мерзлота' } })).toEqual(
      [
        {
          id: 'skill',
          title: 'Умение действует',
          text: 'Действует умение «Вечная мерзлота»',
        },
      ],
    );
    // умение без названия строку не ломает
    expect(persistentEffectsOf({ skillActive: true })[0].text).toBe('Действует умение «героя»');
    expect(
      persistentEffectsOf({ skillActive: false, skill: { title: 'Вечная мерзлота' } }),
    ).toEqual([]);
  });

  it('порядок — лимит первым, а перечисление без «Важно!» и со строчной буквой после точки с запятой', () => {
    const effects = persistentEffectsOf({
      handLimit: 5,
      skillActive: true,
      skill: { title: 'Вечная мерзлота' },
    });

    expect(effects.map(effect => effect.id)).toEqual(['handLimit', 'skill']);
    expect(effectsNoticeText(effects)).toBe(
      'Снижен лимит карт в руке до 5; действует умение «Вечная мерзлота»',
    );
    // «Важно!» добавляет словарь подсказок, чтобы фраза жила в одном месте
    expect(effectsNoticeText([])).toBe('');
    expect(effectsNoticeText(null)).toBe('');
  });
});
