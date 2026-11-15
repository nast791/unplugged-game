// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { HINTS } from '../../../shared/constants/hints.js';
import { battleSummaryOf } from '../../../app/composables/game/useBattleView.js';

/**
 * Пока итог битвы не закрыт, лента подсказок говорит, что случилось: урон считается вместе —
 * и карты, и свойства (`taken`). Формат короткий и без падежей («Анубис: Ифрит −5»): сначала
 * кто бил, потом кто сколько получил — имена бойцов приходят из паков в именительном.
 */
const sides = (attacker, defender) => ({
  damage: attacker.damage + defender.damage,
  sides: [
    { key: 'attacker', name: 'Ифрит', damage: attacker.damage },
    { key: 'defender', name: 'Анубис', damage: defender.damage },
  ],
});

describe('итог битвы в ленте подсказок', () => {
  it('урон обеих сторон — две пары «кто кого ударил», от источника', () => {
    expect(battleSummaryOf(sides({ damage: 5 }, { damage: 2 }))).toBe(
      'Анубис: Ифрит −5; Ифрит: Анубис −2',
    );
  });

  it('ранен только защитник — одна пара', () => {
    expect(battleSummaryOf(sides({ damage: 0 }, { damage: 3 }))).toBe('Ифрит: Анубис −3');
  });

  it('никто не ранен — строки нет', () => {
    expect(battleSummaryOf(sides({ damage: 0 }, { damage: 0 }))).toBe('');
    expect(battleSummaryOf(null)).toBe('');
  });

  it('подсказка добавляет ожидание к итогу и живёт без него', () => {
    const summary = battleSummaryOf(sides({ damage: 5 }, { damage: 0 }));

    expect(HINTS.client.battleResult({ summary })).toBe(
      'Анубис: Ифрит −5. Ждём закрытия окна битвы.',
    );
    expect(HINTS.client.battleResult()).toBe('Ждём закрытия окна битвы.');
  });
});
