import { describe, expect, it } from 'vitest';
import { effectWorth } from '../../../bot/play/cards.js';
import { attackWeight } from '../../../bot/play/policy.js';

/**
 * Оценка размена в весе атаки (§37): карта стоит своего числа **вместе с усилением**, ответный удар
 * учитывается, когда боец может его не пережить, а на исходе колоды бездействие дороже атаки.
 *
 * Гены считает только политика `trade` (`tradeCost`/`tradeRisk`/`tradeFuel`); у эталонов они нулевые,
 * поэтому их веса не меняются — это стережёт второй тест.
 */
const weights = (extra = {}) => ({
  attack: 10,
  cardValue: 1.5,
  condition: 0,
  finish: 12,
  ...extra,
});

const card = (value, bonus) => ({ id: 'atk', type: 'attack', value, bonus });

const base = { weakness: 0, average: 3 };

describe('оценка размена: цена карты, ответный удар, исход колоды', () => {
  it('усиление карты — это цена: карта 4/3 в бою дороже, чем 4/0', () => {
    const trade = weights({ tradeCost: 1 });
    const cheap = attackWeight(card(4, 0), trade, base);
    const fuelHeavy = attackWeight(card(4, 3), trade, base);

    expect(fuelHeavy).toBeLessThan(cheap);
    // эталон без гена цену усиления не видит
    expect(attackWeight(card(4, 3), weights(), base)).toBe(cheap);
  });

  it('ответный удар: под чужой атакой, которую не пережить, вес падает', () => {
    const trade = weights({ tradeRisk: 1 });
    const safe = attackWeight(card(3, 0), trade, { ...base, hp: 12, threat: 4 });
    const doomed = attackWeight(card(3, 0), trade, { ...base, hp: 3, threat: 9 });

    expect(doomed).toBeLessThan(safe);
  });

  it('добивание риском не наказывается: убийство снимает угрозу', () => {
    const trade = weights({ tradeRisk: 1 });
    const doomed = attackWeight(card(3, 0), trade, { ...base, hp: 3, threat: 9 });
    const finishing = attackWeight(card(3, 0), trade, { ...base, hp: 3, threat: 9, weakness: 2 });

    expect(finishing).toBeGreaterThan(doomed);
  });

  it('исход колоды: когда доборов мало, атака становится дороже добора', () => {
    const trade = weights({ tradeFuel: 3 });
    const early = attackWeight(card(3, 0), trade, { ...base, fuel: 12 });
    const late = attackWeight(card(3, 0), trade, { ...base, fuel: 2 });

    expect(late).toBeGreaterThan(early);
  });

  it('плавный рост по колоде: чем меньше доборов, тем дороже атака (и без порога)', () => {
    const trade = weights({ tradeFuelSlope: 0.4 });
    const full = attackWeight(card(3, 0), trade, { ...base, fuel: 20 });
    const half = attackWeight(card(3, 0), trade, { ...base, fuel: 10 });
    const low = attackWeight(card(3, 0), trade, { ...base, fuel: 4 });

    expect(half).toBeGreaterThan(full);
    expect(low).toBeGreaterThan(half);
  });

  it('цена ранения: отставание по материалу поднимает цену атаки, перевес — опускает', () => {
    const trade = weights({ tradeWound: 0.5 });
    const behind = attackWeight(card(3, 0), trade, {
      ...base,
      material: { mine: 6, theirs: 20 },
    });
    const ahead = attackWeight(card(3, 0), trade, {
      ...base,
      material: { mine: 20, theirs: 6 },
    });

    expect(behind).toBeGreaterThan(ahead);
  });

  it('размен по картам: пустая рука соперника поднимает цену атаки, полная — опускает', () => {
    const trade = weights({ tradeCards: 0.5 });
    const empty = attackWeight(card(3, 0), trade, { ...base, rivalHand: 0 });
    const full = attackWeight(card(3, 0), trade, { ...base, rivalHand: 7 });

    expect(empty).toBeGreaterThan(full);
    // без гена рука соперника на решение не влияет
    const plain = weights();
    expect(attackWeight(card(3, 0), plain, { ...base, rivalHand: 0 })).toBe(
      attackWeight(card(3, 0), plain, { ...base, rivalHand: 7 }),
    );
  });

  it('колода соперника: тонкая чужая колода поднимает цену атаки, тонкая своя — опускает', () => {
    // ген проверяется отдельно: `tradeFuelSlope` тоже смотрит на колоду (свою) и в паре с чужим
    // запасом читался бы как противоречие — на одном решении обе величины меняются
    const trade = weights({ tradeRivalFuel: 0.5 });
    // моя колода вдвое толще его: истощение ближе у него — давить выгодно
    const hisThin = attackWeight(card(3, 0), trade, { ...base, fuel: 18, rivalFuel: 10 });
    // наоборот: моя тоньше — бой приближает моё истощение
    const mineThin = attackWeight(card(3, 0), trade, { ...base, fuel: 10, rivalFuel: 18 });

    expect(hisThin).toBeGreaterThan(mineThin);
    // тот же ген при равных колодах не меняет вес
    const even = attackWeight(card(3, 0), trade, { ...base, fuel: 10, rivalFuel: 10 });
    expect(even).toBe(attackWeight(card(3, 0), trade, base));
    // без гена колода соперника на решение не влияет
    const plain = weights();
    expect(attackWeight(card(3, 0), plain, { ...base, fuel: 18, rivalFuel: 10 })).toBe(
      attackWeight(card(3, 0), plain, { ...base, fuel: 10, rivalFuel: 18 }),
    );
  });

  it('без генов вес атаки прежний: эталоны не меняются', () => {
    const plain = weights();
    expect(attackWeight(card(3, 2), plain, { ...base, hp: 1, threat: 9, fuel: 0 })).toBe(
      attackWeight(card(3, 2), plain, base),
    );
  });
});

/**
 * Карта **без свойств** — не «пустая»: её ценность такая же, как у карты со свойствами, и оценивать
 * её условиями нечем. Ветку «свойство не сработало» получают только карты, у которых правила есть:
 * у такой карты `known: true` и `fires === 0` (см. `bot/play/decide.js` — вес 0).
 */
describe('эффект без свойств: оценка не выдумывается', () => {
  it('карта без правил даёт `known: false` и не наказывается вето', () => {
    const plain = { id: 'plain', type: 'effect', value: 3, bonus: 1, rules: [] };

    const worth = effectWorth(plain, { players: [] }, '0');
    expect(worth).toEqual({ value: 0, cost: 0, fires: 0, known: false });
    // вето ставится только при `known && fires === 0`, то есть карта без свойств его не получает
    expect(worth.known && worth.fires === 0).toBe(false);
  });
});
