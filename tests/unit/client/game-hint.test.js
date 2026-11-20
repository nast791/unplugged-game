import { describe, expect, it } from 'vitest';
import { HINT_TONES, resolveGameHint } from '../../../app/composables/game/useGameHint.js';

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
    ).toEqual({ notice: '', text: 'Клетка сейчас недоступна', tone: HINT_TONES.danger });
  });

  it('ход компьютера важнее подсказки фазы', () => {
    expect(
      resolveGameHint({ hint: 'Ваш ход: возьмите карту из колоды', aiThinking: true }),
    ).toEqual({ notice: '', text: 'Компьютер думает…', tone: HINT_TONES.wait });
  });

  it('подсказка движка — основной случай', () => {
    expect(resolveGameHint({ hint: 'Выберите цель среди подсвеченных бойцов' })).toEqual({
      notice: '',
      text: 'Выберите цель среди подсвеченных бойцов',
      tone: HINT_TONES.hint,
    });
  });

  it('отправка хода — когда сказать больше нечего', () => {
    expect(resolveGameHint({ hint: '  ', pending: true })).toEqual({
      notice: '',
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

/**
 * «Важно!» над подсказкой: постоянные эффекты **своего** героя (сниженный лимит руки, включённое умение).
 * Строка собирается до выбора сообщения, поэтому стоит перед любым из них, и «Важно!» пишется один раз на
 * всё перечисление. Без сообщения окна нет — ради одной тревожной строки оно не поднимается.
 */
describe('resolveGameHint: строка «Важно!»', () => {
  const effects = [
    { id: 'handLimit', title: 'Лимит руки снижен', text: 'Снижен лимит карт в руке до 5' },
    { id: 'skill', title: 'Умение действует', text: 'Действует умение «Вечная мерзлота»' },
  ];

  it('стоит перед подсказкой движка и перечисляет эффекты одним «Важно!»', () => {
    const hint = resolveGameHint({ hint: 'Выберите цель среди подсвеченных бойцов', effects });

    expect(hint.notice).toBe(
      'Важно! Снижен лимит карт в руке до 5; действует умение «Вечная мерзлота».',
    );
    expect(hint.text).toBe('Выберите цель среди подсвеченных бойцов');
  });

  it('стоит и перед ошибкой, и перед ходом компьютера, и перед отправкой', () => {
    expect(resolveGameHint({ error: 'Клетка сейчас недоступна', effects }).notice).toContain(
      'Важно!',
    );
    expect(resolveGameHint({ aiThinking: true, effects }).notice).toContain('Важно!');
    expect(resolveGameHint({ pending: true, effects }).notice).toContain('Важно!');
  });

  it('без эффектов строки нет, а без сообщения нет и окна', () => {
    expect(resolveGameHint({ hint: 'Ваш ход' }).notice).toBe('');
    expect(resolveGameHint({ effects })).toBeNull();
  });

  it('один эффект — одно перечисление без запятых', () => {
    expect(resolveGameHint({ hint: 'Ваш ход', effects: [effects[0]] }).notice).toBe(
      'Важно! Снижен лимит карт в руке до 5.',
    );
  });
});
