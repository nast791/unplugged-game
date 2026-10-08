import { describe, expect, it } from 'vitest';
import { cardPromise, cardTags, effectWorth, optionWorth } from '../../../bot/play/cards.js';
import { cardById, resourceTags } from '../../../bot/play/pool.js';
import { card as fixtureCard, createState, fighter, player } from '../../fixtures/state.js';

/**
 * Оценка своих карт и умений: сколько свойство стоит и что даёт. Проверяем на **реальном контенте** —
 * ступени катушек Теслы, пороги и метки Снежной королевы: если числа карты поменяют, тест это увидит.
 * Плюс синтетические правила: так проверены ветки таблицы, которых у героев пула пока нет.
 */
const worth = (cardId, optionId) => optionWorth(cardById(cardId), optionId);

/** Карта-заготовка: правила момента `picked` для одного варианта свойства. */
const card = (then, when = [{ fact: 'PICKED', params: { is: 'pick' } }]) => ({
  id: 'test_01',
  options: [{ id: 'pick', text: 'вариант' }],
  rules: [{ moment: 'picked', when, then }],
});

describe('оценка свойства: контент', () => {
  it('Тесла: ступень за две катушки дороже, но даёт больше', () => {
    const one = worth('tesla_02', 'spend1');
    const two = worth('tesla_02', 'spend2');

    // «деактивируйте 1 катушку и получите 1 действие» против «2 катушки: действие и карта»
    expect(one).toMatchObject({ value: 3, cost: 1, known: true });
    expect(two.value).toBeGreaterThan(one.value);
    expect(two.cost).toBeGreaterThan(one.cost);
  });

  it('Тесла: отмена свойств карты противника ценнее у ступени за две катушки', () => {
    // «свойства не действуют» (1 катушка) против того же плюс «значение его карты становится 0»
    expect(worth('tesla_07', 'resonance2').value).toBeGreaterThan(
      worth('tesla_07', 'resonance1').value,
    );
    expect(worth('tesla_07', 'resonance2').cost).toBeGreaterThan(
      worth('tesla_07', 'resonance1').cost,
    );
  });

  it('Тесла: заряд катушек — польза, разряд с лечением — польза за плату', () => {
    expect(worth('tesla_01', 'charge')).toMatchObject({ value: 2, cost: 0, known: true });
    expect(worth('tesla_01', 'discharge')).toMatchObject({ value: 2, cost: 1, known: true });
  });

  it('незнакомый вариант не оценивается: политика сыграет его как раньше', () => {
    expect(worth('tesla_02', 'нет-такого')).toEqual({ value: 0, cost: 0, known: false });
    expect(optionWorth(null, 'spend1')).toEqual({ value: 0, cost: 0, known: false });
  });
});

describe('оценка свойства: таблица действий', () => {
  it('польза: действие, добор, урон чужому и лечение своего', () => {
    expect(optionWorth(card([{ action: 'SET_ACTIONS', delta: 1 }]), 'pick').value).toBe(3);
    expect(optionWorth(card([{ action: 'SET_CARDS', op: 'draw', count: 2 }]), 'pick').value).toBe(
      3,
    );
    expect(optionWorth(card([{ action: 'SET_MOVEMENT', op: 'open' }]), 'pick').value).toBe(1.5);
    expect(optionWorth(card([{ action: 'REVIVE_FIGHTER', group: 'crow' }]), 'pick').value).toBe(4);
    // урон чужому бойцу: сторона выведена из переменной факта FIGHTERS
    expect(
      optionWorth(
        card(
          [{ action: 'SET_HEALTH', fighterIds: '$foes', delta: -2 }],
          [
            { fact: 'PICKED', params: { is: 'pick' } },
            { fact: 'FIGHTERS', params: { side: 'opponent' }, var: 'foes' },
          ],
        ),
        'pick',
      ).value,
    ).toBe(4);
    // лечение своего героя
    expect(
      optionWorth(
        card(
          [{ action: 'SET_HEALTH', fighterIds: '$heroes', delta: 2 }],
          [
            { fact: 'PICKED', params: { is: 'pick' } },
            { fact: 'FIGHTERS', params: { side: 'self' }, var: 'heroes' },
          ],
        ),
        'pick',
      ).value,
    ).toBe(2);
  });

  it('цена: трата ресурса, своя карта, свой боец и сброс с колоды', () => {
    expect(
      optionWorth(
        card([{ action: 'SET_ITEM', group: 'coil', from: 'active', to: 'inactive', count: 2 }]),
        'pick',
      ).cost,
    ).toBe(2);
    expect(optionWorth(card([{ action: 'SET_CARDS', op: 'discard', count: 1 }]), 'pick').cost).toBe(
      1.5,
    );
    // с колоды дешевле: верхняя карта и так ушла бы
    expect(
      optionWorth(card([{ action: 'SET_CARDS', op: 'discard', from: 'deck', count: 1 }]), 'pick')
        .cost,
    ).toBe(0.5);
    expect(
      optionWorth(card([{ action: 'SET_HEALTH', fighterIds: '$mine', delta: -1 }]), 'pick').cost,
    ).toBe(1);
    // сброс чужой руки — польза, а не цена
    expect(
      optionWorth(
        card([{ action: 'SET_CARDS', op: 'discard', side: 'opponent', count: 1 }]),
        'pick',
      ),
    ).toMatchObject({ value: 1.5, cost: 0 });
  });

  it('незнакомое действие даёт ноль: оценка не выдумывается', () => {
    expect(optionWorth(card([{ action: 'SET_TARGETING', op: 'open' }]), 'pick')).toMatchObject({
      value: 0,
      cost: 0,
      known: false,
    });
  });
});

describe('ресурсы героя', () => {
  it('метки карты совпадают с ресурсом героя: у Снежной королевы это осколок', () => {
    expect([...resourceTags('snow-queen')]).toEqual(['shard']);
    expect([...cardTags(cardById('snow-queen_06'))]).toEqual(['shard']);
    // у Теслы ресурс — катушки-предметы, меток на картах нет
    expect([...resourceTags('tesla')]).toContain('coil');
    expect(cardTags(cardById('tesla_02')).size).toBe(0);
  });
});

/**
 * Обещание карты (`cardPromise`): условия проверяет **движок** (`runConditions`), поэтому проверяем не
 * пересказ текста карты, а совпадение с тем, что исполнит движок. Цели боя подставляются заранее —
 * до объявления карты факты `COMBAT` проверить нечем.
 */
describe('обещание карты: условия её же правил', () => {
  const stateOf = () => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const anubis = player(state, '0');
    anubis.heroId = 'anubis';
    anubis.fighters[0].id = 'anubis'; // в фикстуре герой зовётся alpha
    return state;
  };
  const target = { fighterId: 'beta', playerId: '1' };

  it('Анубис: «Погребальный звон» — 6 в покое и 4 после шага', () => {
    const state = stateOf();
    const card = cardById('anubis_01');
    expect(card.value).toBe(4);
    expect(cardPromise(card, state, '0').strength).toBe(6);

    player(state, '0').fighters[0].movedThisTurn = true;
    expect(cardPromise(card, state, '0').strength).toBe(4);
  });

  it('Анубис: «Печать Маат» дороже, когда у врага 4 карты и больше', () => {
    const state = stateOf();
    const spell = cardById('anubis_03');
    expect(cardPromise(spell, state, '0', { target }).worth).toBe(0);

    const enemy = player(state, '1');
    enemy.hand.cards = [
      ...enemy.hand.cards,
      fixtureCard({ id: 'b1' }),
      fixtureCard({ id: 'b2' }),
      fixtureCard({ id: 'b3' }),
    ];
    // сброс случайной карты врага — польза в единицах `bot/play/cards.js`
    expect(cardPromise(spell, state, '0', { target }).worth).toBe(1.5);
    // без цели чужую руку проверить нечем: обещания нет
    expect(cardPromise(spell, state, '0').worth).toBe(0);
  });

  it('Анубис: «Песчаная буря» бьёт на 4, если цель стоит на песке', () => {
    const state = stateOf();
    state.map.nodes.find(node => node.id === 10).terrain = 'desert';
    const storm = cardById('anubis_02');

    expect(cardPromise(storm, state, '0', { target }).strength).toBe(4); // 3 + 1 урон
    state.map.nodes.find(node => node.id === 10).terrain = 'forest';
    expect(cardPromise(storm, state, '0', { target }).strength).toBe(3);
  });

  it('Анубис: «Песчаный саван» — 4, когда **мой** боец на песке, а не чужой', () => {
    const state = stateOf();
    const card = cardById('anubis_07'); // карта без привязки: играется и за Анубиса, и за Амат
    expect(cardPromise(card, state, '0').strength).toBe(3);

    // чужая клетка (beta) на песке: «свой в этой битве» — не он, обещания нет
    state.map.nodes.find(node => node.id === 10).terrain = 'desert';
    expect(cardPromise(card, state, '0', { target }).strength).toBe(3);

    // мой боец на песке — цель боя ещё не выбрана, но обещание возможно любым своим бойцом
    state.map.nodes.find(node => node.id === 8).terrain = 'desert';
    expect(cardPromise(card, state, '0').strength).toBe(4);
  });

  it('чужую карту боя обещание не подглядывает: «Саван» без вскрытия не считается', () => {
    const state = stateOf();
    state.combat = {
      stage: 'defense',
      attackerPlayerId: '1',
      defenderPlayerId: '0',
      attackCard: { id: 'hidden', value: 3, bonus: 4 },
      defenseCard: null,
    };
    // значение «Санава» равно усилению чужой карты, но защитник его ещё не видит (§13)
    expect(cardPromise(cardById('anubis_04'), state, '0', { open: true }).strength).toBe(0);
  });

  it('незнакомая или пустая карта обещаний не даёт', () => {
    const state = stateOf();
    expect(cardPromise(null, state, '0')).toEqual({ strength: 0, worth: 0 });
    // `ifrit_01` — карта без свойств: её число остаётся напечатанным
    const plain = cardById('ifrit_01');
    expect(cardPromise(plain, state, '0')).toEqual({ strength: plain.value, worth: 0 });
  });
});

/**
 * Польза эффектной карты (`effectWorth`): «кинуть впустую» — это сыграть карту, у которой ни одно
 * правило не выполняется. Такую карту политика получает с весом 0 (вето), поэтому она остаётся в руке
 * до момента, когда свойство сработает.
 */
describe('польза эффекта: карта впустую не играется', () => {
  const stateOf = () => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const hero = player(state, '0');
    hero.heroId = 'ifrit';
    hero.fighters[0].id = 'ifrit'; // в фикстуре герой зовётся alpha
    return state;
  };

  it('Ифрит: «Пламя преисподней» даёт ноль, если духов нет, и ценность при трёх', () => {
    const state = stateOf();
    const card = cardById('ifrit_11');

    const empty = effectWorth(card, state, '0');
    expect(empty.fires).toBe(0);
    expect(empty.known).toBe(true);
    expect(empty.value).toBe(0);

    // три духа по одному hp — ровно то, что требует карта
    for (const id of ['ash_1', 'ash_2', 'ash_3']) {
      player(state, '0').fighters.push(
        fighter({
          id,
          name: id,
          type: 'assistant',
          group: 'ash',
          currentPosition: 5,
          currentHp: 1,
        }),
      );
    }

    const ready = effectWorth(card, state, '0');
    expect(ready.fires).toBeGreaterThan(0);
    expect(ready.value).toBeGreaterThan(0);
  });

  it('Снежная королева: карта не срабатывает, пока герой заморожен', () => {
    const state = stateOf();
    const card = cardById('snow-queen_11');
    player(state, '0').fighters[0].id = 'snow-queen';

    expect(effectWorth(card, state, '0').fires).toBeGreaterThan(0);

    player(state, '0').fighters[0].frozen = true;
    expect(effectWorth(card, state, '0').fires).toBe(0);
  });

  it('карта без правил не наказывается: `known: false` — оценка не выдумывается', () => {
    const state = stateOf();
    expect(effectWorth({ id: 'unknown', type: 'effect' }, state, '0')).toEqual({
      value: 0,
      cost: 0,
      fires: 0,
      known: false,
    });
    expect(effectWorth(cardById('ifrit_01'), state, '0').known).toBe(false);
  });
});
