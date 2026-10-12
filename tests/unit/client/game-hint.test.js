import { describe, expect, it } from 'vitest';
import { HINT_TONES, resolveGameHint } from '../../../app/composables/useGameHint.js';

/**
 * Старшинство подсказок экрана партии: пока правило не было сведено в `resolveGameHint`, ошибка хода
 * (`message`) пряталась за подсказкой фазы (`hint = ui.hint || message`), а во время хода компьютера
 * подсказка фазы читалась как «твой ход».
 */
describe('resolveGameHint', () => {
  it('ошибка важнее подсказки фазы и хода компьютера', () => {
    expect(
      resolveGameHint({
        error: 'Клетка сейчас недоступна',
        hint: 'Ваш ход: возьмите карту из колоды',
        aiThinking: true,
        pending: true,
      }),
    ).toEqual({ text: 'Клетка сейчас недоступна', tone: HINT_TONES.danger });
  });

  it('ход компьютера важнее подсказки фазы', () => {
    expect(
      resolveGameHint({ hint: 'Ваш ход: возьмите карту из колоды', aiThinking: true }),
    ).toEqual({ text: 'Компьютер думает…', tone: HINT_TONES.wait });
  });

  it('подсказка движка — основной случай', () => {
    expect(resolveGameHint({ hint: 'Выберите цель среди подсвеченных бойцов' })).toEqual({
      text: 'Выберите цель среди подсвеченных бойцов',
      tone: HINT_TONES.hint,
    });
  });

  it('отправка хода — когда сказать больше нечего', () => {
    expect(resolveGameHint({ hint: '  ', pending: true })).toEqual({
      text: 'Ход отправляется…',
      tone: HINT_TONES.wait,
    });
  });

  it('пусто — окно не рисуем', () => {
    expect(resolveGameHint()).toBeNull();
    expect(
      resolveGameHint({ hint: '', error: '   ', aiThinking: false, pending: false }),
    ).toBeNull();
    expect(resolveGameHint({ hint: null, error: undefined })).toBeNull();
  });

  it('строку не подменяем: текст ошибки и подсказки берём как есть, без пробелов по краям', () => {
    expect(resolveGameHint({ hint: '  Ждём перемещения бойцов: Медуза  ' })?.text).toBe(
      'Ждём перемещения бойцов: Медуза',
    );
  });
});
