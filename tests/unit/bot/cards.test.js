import { describe, expect, it } from 'vitest';
import {
  cardPromise,
  cardTags,
  effectWorth,
  handContext,
  optionWorth,
} from '../../../bot/play/cards.js';
import { cardById, resourceTags } from '../../../bot/play/pool.js';
import { bonusOutcomes } from '../../../bot/play/counting.js';
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
    // длинный шаг, проход сквозь строй и проход с уроном/кражей оценка читает из самого действия
    expect(
      optionWorth(
        card([
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            budget: 4,
            throughEnemies: true,
            damageOnPass: 1,
            healOnPass: 1,
          },
        ]),
        'pick',
      ).value,
    ).toBe(4.75);
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

  it('Анубис: «Погребальный звон» — 5 в покое и 3 после шага', () => {
    const state = stateOf();
    const card = cardById('anubis_01');
    expect(card.value).toBe(3);
    expect(cardPromise(card, state, '0').strength).toBe(5);

    player(state, '0').fighters[0].movedThisTurn = true;
    expect(cardPromise(card, state, '0').strength).toBe(3);
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

  it('Анубис: «Песчаная буря» бьёт на 7, если цель стоит на песке', () => {
    const state = stateOf();
    state.map.nodes.find(node => node.id === 10).terrain = 'desert';
    const storm = cardById('anubis_02');
    expect(storm.value).toBe(5);

    // 5 картой + 2 урона свойством: цель считается задетой, поэтому число карты растёт на урон
    expect(cardPromise(storm, state, '0', { target }).strength).toBe(7);
    state.map.nodes.find(node => node.id === 10).terrain = 'forest';
    expect(cardPromise(storm, state, '0', { target }).strength).toBe(5);
  });

  it('Анубис: «Тайна бальзамирования» обещает возврат карты эффекта из сброса', () => {
    const state = stateOf();
    const card = cardById('anubis_07'); // карта без привязки: играется и за Анубиса, и за Амат
    expect(card.title).toBe('Тайна бальзамирования');
    expect(card.value).toBe(3);
    // возврат карты из сброса числа боя не меняет: обещание равно напечатанному значению
    expect(cardPromise(card, state, '0').strength).toBe(3);

    // карта эффекта в сбросе — свойство срабатывает: это и есть «не впустую» (`effectWorth.fires`)
    const dry = effectWorth(card, state, '0', { target });
    player(state, '0').discard.cards = [fixtureCard({ id: 'anubis_09', type: 'effect' })];
    const ready = effectWorth(card, state, '0', { target });

    expect(ready.fires).toBeGreaterThan(dry.fires);
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
    expect(cardPromise(null, state, '0')).toEqual({ strength: 0, worth: 0, deferred: 0 });
    // `ifrit_01` — карта без свойств: её число остаётся напечатанным
    const plain = cardById('ifrit_01');
    expect(cardPromise(plain, state, '0')).toEqual({
      strength: plain.value,
      worth: 0,
      deferred: 0,
    });
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

  it('Ифрит: «Пепельный ветер» горит на пепле — без духов шаг длиннее, чем с роем', () => {
    const state = stateOf();
    const card = cardById('ifrit_11');

    // духов нет: мёртвых трое, значит «мёртвых + 2» = пять клеток — карта не впустую
    const empty = effectWorth(card, state, '0');
    expect(empty.known).toBe(true);
    expect(empty.fires).toBeGreaterThan(0);
    expect(empty.value).toBeGreaterThan(0);

    // три живых духа — мёртвых ноль: шаг короче (2 клетки), и оценка это видит — бюджет читается
    // из самого действия (`SET_MOVEMENT`), как и проход сквозь строй с уроном и кражей
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

    const swarm = effectWorth(card, state, '0');
    expect(swarm.fires).toBeGreaterThan(0);
    expect(swarm.value).toBeLessThan(empty.value);
  });

  it('Снежная королева: карта не срабатывает, пока герой заморожен', () => {
    const state = stateOf();
    const card = cardById('snow-queen_11');
    player(state, '0').fighters[0].id = 'snow-queen';

    expect(effectWorth(card, state, '0').fires).toBeGreaterThan(0);

    player(state, '0').fighters[0].frozen = true;
    expect(effectWorth(card, state, '0').fires).toBe(0);
  });

  it('Ифрит: «Сжечь всех дотла» считает урон по владельцу каждого бойца в радиусе', () => {
    const state = stateOf();
    const card = cardById('ifrit_14');
    // фикстура: свой боец на 9, чужой на 10, герой-Ифрит на 8 — оба в двух шагах
    const worth = effectWorth(card, state, '0');

    expect(worth.fires).toBeGreaterThan(0);
    // чужому 2 урона — по 2 за здоровье, своему 2 — цена по 1: польза и цена порознь,
    // поэтому своя часть не прячется за чужой
    expect(worth.value).toBe(4);
    expect(worth.cost).toBe(2);
  });

  it('карта без правил не наказывается: `known: false` — оценка не выдумывается', () => {
    const state = stateOf();
    expect(effectWorth({ id: 'unknown', type: 'effect' }, state, '0')).toEqual({
      value: 0,
      cost: 0,
      fires: 0,
      known: false,
      ruleFires: [],
    });
    expect(effectWorth(cardById('ifrit_01'), state, '0').known).toBe(false);
  });
});

/**
 * Экономика руки: добор — не всегда польза.
 *
 * Карта сверх лимита руки уходит в сброс в конце хода, то есть колода сожжена, а карта не сыграна. Добор
 * **противнику** — подарок (его карты его и усиливают), и только перебор его руки или пустая его колода
 * превращают принудительный добор в мой плюс: за карту, которой не нашлось, все его бойцы получают
 * `rules.exhaustionDamage`. Сторона берётся из самого действия: `side`, `of: 'opponent'` или переменная
 * факта `FIGHTERS { side }` — без этого знак пользы зависел от того, как правило записано.
 */
describe('экономика руки: чья рука наполняется и что с лишними картами', () => {
  const ruleCard = then => ({
    id: 'test_02',
    options: [{ id: 'pick', text: 'вариант' }],
    rules: [{ moment: 'picked', when: [{ fact: 'PICKED', params: { is: 'pick' } }], then }],
  });
  const economy = (patch = {}) => ({
    hand: 3,
    limit: 7,
    rivalHand: 2,
    rivalLimit: 7,
    rivalDeck: 4,
    rivalMaterial: 1,
    exhaust: 2,
    ...patch,
  });

  it('добор себе: польза только той части, что влезает в лимит руки', () => {
    const draw = ruleCard([{ action: 'SET_CARDS', op: 'draw', count: 2 }]);

    expect(optionWorth(draw, 'pick', economy())).toMatchObject({ value: 3, cost: 0 });
    // рука 6 из 7: одна карта влезет, вторая сгорит в конце хода — та же цена, что сброс с колоды
    expect(optionWorth(draw, 'pick', economy({ hand: 6 }))).toMatchObject({
      value: 1.5,
      cost: 0.5,
    });
    // без контекста — прежняя цена за карту
    expect(optionWorth(draw, 'pick').value).toBe(3);
  });

  it('добор противнику — цена, а не польза', () => {
    const gift = ruleCard([{ action: 'SET_CARDS', of: 'opponent', op: 'draw', count: 2 }]);

    expect(optionWorth(gift, 'pick')).toMatchObject({ value: 0, cost: 3 });
    expect(optionWorth(gift, 'pick', economy())).toMatchObject({ value: 0, cost: 3 });
    // …кроме перебора его руки: карты сверх лимита сгорят у него
    expect(optionWorth(gift, 'pick', economy({ rivalHand: 6 }))).toMatchObject({
      value: 1.5,
      cost: 1.5,
    });
  });

  it('бомба истощения: принудительный добор на пустой колоде бьёт всех его бойцов', () => {
    const gift = ruleCard([{ action: 'SET_CARDS', of: 'opponent', op: 'draw', count: 2 }]);

    // 2 урона за карту, каждая по цене 2 за hp героя: 8 единиц — дороже любой карты
    expect(optionWorth(gift, 'pick', economy({ rivalDeck: 0 }))).toMatchObject({
      value: 8,
      cost: 0,
    });
    // помощники в материале стороны стоят половину
    expect(optionWorth(gift, 'pick', economy({ rivalDeck: 0, rivalMaterial: 1.5 })).value).toBe(12);
  });

  it('сброс чужой карты по `of` — польза: сторона читается из действия, а не только из переменной', () => {
    // «Ледяное зеркало» Снежной королевы: в правиле `picked` стоит `of: 'opponent'`
    const peek = ruleCard([{ action: 'SET_CARDS', of: 'opponent', op: 'discard', count: 1 }]);

    expect(optionWorth(peek, 'pick')).toMatchObject({ value: 1.5, cost: 0 });
  });

  it('через `effectWorth`: полная рука обесценивает добор в самой карте', () => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const effect = {
      id: 'draw_two',
      type: 'effect',
      value: 2,
      bonus: 1,
      rules: [{ moment: 'effect', then: [{ action: 'SET_CARDS', op: 'draw', count: 2 }] }],
    };

    const roomy = effectWorth(effect, state, '0');
    player(state, '0').hand.cards.push(
      ...Array.from({ length: 4 }, (_, index) => fixtureCard({ id: `extra_${index}` })),
    );
    const choked = effectWorth(effect, state, '0');

    expect(roomy.value).toBeGreaterThan(choked.value);
    expect(choked.cost).toBeGreaterThan(0);
  });
});

/**
 * Запас защит — часть экономики руки (`handContext`): считаются карты, которыми можно ответить на удар,
 * и в руке, и в невышедшей колоде. От этого числа зависит вес атаки гибридом (`policy.js: stockFactor`).
 */
describe('экономика руки: запас защит', () => {
  it('защиты и гибриды считаются в руке и колоде, атаки и эффекты — нет', () => {
    const zone = list => ({ visibility: [], cards: list });
    const state = createState({
      players: [
        {
          id: '0',
          name: 'Атака',
          order: 1,
          deck: zone([
            fixtureCard({ id: 'deck_defense', type: 'defense', value: 3 }),
            fixtureCard({ id: 'deck_attack', type: 'attack', value: 4 }),
            fixtureCard({ id: 'deck_hybrid', type: 'hybrid', value: 3 }),
          ]),
          hand: zone([
            fixtureCard({ id: 'hand_hybrid', type: 'hybrid', value: 4 }),
            fixtureCard({ id: 'hand_attack', type: 'attack', value: 5 }),
            fixtureCard({ id: 'hand_effect', type: 'effect', value: 0 }),
          ]),
          discard: zone([]),
          fighters: [fighter({ id: 'hero_a', currentPosition: 1, currentHp: 12, startHp: 12 })],
        },
        {
          id: '1',
          name: 'Ответ',
          order: 2,
          deck: zone([fixtureCard({ id: 'rival_card', type: 'defense', value: 3 })]),
          hand: zone([fixtureCard({ id: 'rival_hand', type: 'attack', value: 4 })]),
          discard: zone([]),
          fighters: [fighter({ id: 'hero_b', currentPosition: 4, currentHp: 12, startHp: 12 })],
        },
      ],
    });

    const economy = handContext(state, '0');

    // гибрид в руке, защита и гибрид в колоде: это и есть запас, которым отвечать на удары
    expect(economy.defenses).toBe(1);
    expect(economy.deckDefenses).toBe(2);
    expect(economy.hand).toBe(3);
    // чужая рука считается отдельно: по ней политика решает, ждать ответа или давить
    expect(economy.rivalHand).toBe(1);
  });
});

/**
 * Скрытые числа боя и ветки, которые обещание не видело (`.docs/bot-strategies.md`, «Стратегии по
 * героям»): усиление чужой карты (весы Анубиса), свойства чужой карты (отмены), польза ветки `picked`
 * (урон и толчок) и окно номера действия (`AP { spentMin }`).
 */
describe('обещание карты: скрытые числа и отложенные ветки', () => {
  /** Анубис с целой пеленой и целью в дистанции удара. */
  const anubisState = rivalId => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const anubis = player(state, '0');
    anubis.heroId = 'anubis';
    anubis.fighters[0].id = 'anubis';
    anubis.items = [{ id: 'shroud', group: 'shroud', name: 'Пелена', state: 'active' }];
    player(state, '1').heroId = rivalId;
    return state;
  };
  const target = { fighterId: 'beta', playerId: '1' };

  it('Анубис: весы обещают обе половины, взвешивая их вероятностями', () => {
    // «Врата»: Помилование обнуляет чужую карту (2), Наказание отменяет её свойства (3). Какая половина
    // сработает, зависит от усиления чужой карты, поэтому ценность — между двумя половинами
    const light = cardPromise(cardById('anubis_05'), anubisState('dorothy'), '0', { target });
    const heavy = cardPromise(cardById('anubis_05'), anubisState('anubis'), '0', { target });

    expect(light.worth).toBeGreaterThan(2);
    expect(light.worth).toBeLessThan(3);
    // тяжёлая чужая колода чаще включает Наказание — она и ценнее
    expect(heavy.worth).toBeGreaterThan(light.worth);
    expect(heavy.worth).toBeLessThanOrEqual(3);
  });

  it('Анубис: «Саван» берёт усиление чужой карты из распределения по остатку колоды', () => {
    const state = anubisState('anubis');
    const shroud = cardById('anubis_04');
    expect(shroud.value).toBe(0);

    // значение карты становится усилением чужой карты, а «Наказание» добавляет +3, когда чужое усиление
    // строго больше нашего (у «Санава» бонус 2) — оба исхода взвешены их вероятностями
    const outcomes = bonusOutcomes(state, '0');
    const mean = outcomes.reduce((sum, entry) => sum + entry.chance * entry.value, 0);
    const over = outcomes
      .filter(entry => entry.value > shroud.bonus)
      .reduce((sum, entry) => sum + entry.chance, 0);

    expect(cardPromise(shroud, state, '0', { target }).strength).toBeCloseTo(mean + 3 * over, 5);
  });

  it('Ифрит: ветка `picked` даёт урон и толчок — «Ожог» больше не ноль', () => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const ifrit = player(state, '0');
    ifrit.heroId = 'ifrit';
    ifrit.fighters[0].id = 'ifrit';
    // сосед Ифрита — чужой боец: окно выбора бойца открывается, урон и сдвиг идут в `picked`
    const beta = player(state, '1').fighters[0];
    beta.currentPosition = 9;

    const worth = effectWorth(cardById('ifrit_10'), state, '0', { target });

    // 2 урона чужому бойцу (2 за hp) плюс сдвиг его до двух клеток
    expect(worth.value).toBeGreaterThanOrEqual(4);
  });

  it('Ифрит: «Три обещания» обещают лучший вариант — добор двух карт', () => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const ifrit = player(state, '0');
    ifrit.heroId = 'ifrit';
    ifrit.fighters[0].id = 'ifrit';

    expect(effectWorth(cardById('ifrit_12'), state, '0').value).toBeGreaterThanOrEqual(3);
  });

  it('номер действия: «Счёт ударов» обещает своё окно, а не чужое', () => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const ifrit = player(state, '0');
    ifrit.heroId = 'ifrit';
    ifrit.fighters[0].id = 'ifrit';
    // колода соперника известна: без неё нечего оценивать («есть ли у его карты свойства»)
    player(state, '1').heroId = 'anubis';
    // ход из трёх действий
    state.turn.actionsTotal = 3;

    // карта объявляется первым действием: окно «второго действия» (spentMin 2) ещё впереди,
    // значит отмена обещается не этой карте — она уходит в `deferred`
    state.turn.actionsLeft = 3;
    const first = cardPromise(cardById('ifrit_13'), state, '0', { target });
    expect(first.deferred).toBeGreaterThan(0);

    // объявляется вторым — окно наступило (карта сама тратит действие), обещание принадлежит ей
    state.turn.actionsLeft = 2;
    const second = cardPromise(cardById('ifrit_13'), state, '0', { target });
    expect(second.worth).toBeGreaterThan(first.worth);
    expect(second.deferred).toBe(0);

    // третьим действием после шага карта бьёт на 7 (+2 к пятёрке)
    state.turn.actionsLeft = 1;
    ifrit.fighters[0].movedThisTurn = true;
    expect(cardPromise(cardById('ifrit_13'), state, '0', { target }).strength).toBe(7);
  });

  it('Анубис: «Зал суда» бьёт на число карт эффектов в сбросе — урон переменной', () => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const anubis = player(state, '0');
    anubis.heroId = 'anubis';
    anubis.fighters[0].id = 'anubis';
    const hall = cardById('anubis_11');
    const effects = count =>
      (anubis.discard = {
        visibility: [],
        cards: Array.from({ length: count }, (_, index) => ({
          id: 'anubis_09',
          instanceId: `effect_${index}`,
          type: 'effect',
        })),
      });

    // урон приходит полем `damage`, а не `delta`: без этой ветки карта стоила ноль (было 140 розыгрышей
    // с пользой 0, §74)
    effects(3);
    expect(effectWorth(hall, state, '0').value).toBe(6);
    // пустой сброс: срабатывает вторая ветка правила — ровно 1 урон
    effects(0);
    expect(effectWorth(hall, state, '0').value).toBe(2);
  });

  it('Снежная королева: «Жертва» обещает действие, только если ворона погибнет', () => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const queen = player(state, '0');
    queen.heroId = 'snow-queen';
    queen.fighters[0].id = 'snow-queen';
    const crow = {
      ...queen.fighters[1],
      id: 'crow',
      type: 'assistant',
      group: 'crow',
      currentHp: 1,
      startHp: 6,
      currentPosition: 9,
    };
    queen.fighters.push(crow);
    const sacrifice = cardById('snow-queen_08');

    // 1 hp: урон карты в 1 добивает ворону, значит ветка `lost` (+1 действие) сбудется
    expect(cardPromise(sacrifice, state, '0', { target }).worth).toBeGreaterThan(0);

    // 4 hp: тот же урон не убивает, обещания нет
    crow.currentHp = 4;
    expect(cardPromise(sacrifice, state, '0', { target }).worth).toBe(0);
  });
});

/**
 * `SET_CARDS { op: 'move' }` из сброса в колоду — не «мелкая польза»: у Снежной королевы сброс считает
 * осколки, и карта, ушедшая из него, роняет порог («Кристальный резонанс» платит своим же умением).
 */
describe('оценка действия: карта из сброса обратно в колоду', () => {
  const effect = then => ({
    id: 'move_back',
    type: 'effect',
    rules: [{ moment: 'effect', then }],
  });

  it('возврат в колоду стоит, а не приносит', () => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const worth = effectWorth(
      effect([{ action: 'SET_CARDS', op: 'move', from: 'discard', to: 'deck', count: 1 }]),
      state,
      '0',
    );

    expect(worth.cost).toBeGreaterThan(0);
    expect(worth.value).toBe(0);
  });

  it('возврат в руку — наоборот, польза', () => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const worth = effectWorth(
      effect([{ action: 'SET_CARDS', op: 'move', from: 'discard', to: 'hand', count: 1 }]),
      state,
      '0',
    );

    expect(worth.value).toBeGreaterThan(0);
  });
});
