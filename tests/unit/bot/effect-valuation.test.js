import { describe, expect, it } from 'vitest';
import { effectWorth } from '../../../bot/play/cards.js';
import { actionsFor } from '../../../bot/play/duel.js';
import { weightsFor } from '../../../bot/play/policy.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, player } from '../../fixtures/state.js';

/**
 * Требование владельца: **карта вообще без свойств ценна так же, как карта со свойствами**, а вето
 * («не играть») получает только карта, у которой свойства есть, но сейчас не срабатывают.
 *
 * Проверяется в двух местах: оценка (`effectWorth`) и то, как из неё получается вес решения
 * (`bot/play/decide.js`): `known: false` → базовый вес `weights.card`, `known && fires === 0` → ноль.
 */
const weightFrom = (worth, weights) =>
  worth?.known && worth.fires === 0
    ? 0
    : weights.card + (Number(weights.effect) || 0) * Math.max(0, worth?.value ?? 0);

const stateWith = cards => {
  const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
  const owner = player(state, '0');
  owner.heroId = 'ifrit';
  owner.fighters[0].id = 'ifrit';
  owner.hand.cards = cards;
  return state;
};

const weightOfCard = (options, cardId) =>
  Number(options.find(entry => String(entry.action?.id) === cardId)?.weight ?? 0);

describe('оценка эффекта: карта без свойств и карта с несработавшим свойством', () => {
  const weights = weightsFor('trade', { hand: 2, canDraw: true, fuel: 20, rivalFuel: 20 });

  it('карта без правил: `known: false`, вес базовый — как у карты со свойствами', () => {
    const plain = { id: 'plain', type: 'effect', value: 3, bonus: 1, rules: [] };
    const worth = effectWorth(plain, { players: [] }, '0');

    expect(worth).toEqual({ value: 0, cost: 0, fires: 0, known: false });
    expect(weightFrom(worth, weights)).toBe(weights.card);
  });

  it('карта с правилом и невыполненным условием: `known: true`, `fires: 0`, вес ноль', () => {
    // `ifrit_11` требует трёх духов «пепла»: без них правило не выполняется — карта не играется
    const storm = ifritCards.find(card => card.id === 'ifrit_11');
    const state = stateWith([{ ...storm, instanceId: 'storm_0' }]);

    const worth = effectWorth(storm, state, '0');
    expect(worth.known).toBe(true);
    expect(worth.fires).toBe(0);
    expect(weightFrom(worth, weights)).toBe(0);

    // и то же видно в живом решении
    const options = actionsFor(state, '0', { policy: 'trade' });
    expect(weightOfCard(options, 'storm_0')).toBe(0);
  });

  it('карта с выполненным условием получает вес выше базового', () => {
    const storm = ifritCards.find(card => card.id === 'ifrit_11');
    const state = stateWith([{ ...storm, instanceId: 'storm_0' }]);
    const owner = player(state, '0');
    // три духа «пепла» по одному hp — ровно то, что требует карта
    for (const [index, id] of ['ash_1', 'ash_2', 'ash_3'].entries()) {
      owner.fighters.push({
        ...owner.fighters[0],
        id,
        type: 'assistant',
        group: 'ash',
        currentHp: 1,
        startHp: 1,
        currentPosition: 5 + index,
      });
    }

    const worth = effectWorth(storm, state, '0');
    expect(worth.fires).toBeGreaterThan(0);
    expect(weightFrom(worth, weights)).toBeGreaterThan(weights.card);
  });

  it('карта без правил не получает вето (проверка формулы, а не отдельной ветки)', () => {
    const empty = { id: 'empty', type: 'effect', value: 1, bonus: 1, rules: [] };
    const worth = effectWorth(empty, { players: [] }, '0');

    expect(weightFrom(worth, weights)).toBeGreaterThan(0);
  });
});
