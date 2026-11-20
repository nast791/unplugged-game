import { describe, expect, it } from 'vitest';
import { runAction, runUi } from '#shared/publicApi.js';
import { actionsFor } from '../../../bot/play/duel.js';
import {
  attackWeight,
  attackerWeight,
  baitFactor,
  cardCostWeight,
  defenseWeight,
  drawWeight,
  holdWeight,
  leadFactor,
  movementWeight,
  optionWeight,
  stockFactor,
  policies,
  policyNames,
  targetWeight,
  weightsFor,
} from '../../../bot/play/policy.js';
import { createState, card as fixtureCard, fighter, player } from '../../fixtures/state.js';
import { cardById } from '../../../bot/play/pool.js';

/**
 * Политики бота: какое действие он предпочтёт. Проверяем не «функция вызвалась», а выбор в ситуациях,
 * которые решают исход партии: есть чем ударить, надо защититься, надо подойти, рука на исходе, карту
 * тратят в окне усиления, цель ранена.
 * Состояния собираются движком (`runAction`) — то есть ровно те, что бот видит в игре.
 */
const weightOf = (options, match) => options.find(option => match(option.action))?.weight ?? 0;
const isCard = id => action => action.kind === 'card' && String(action.id) === String(id);
const isDeck = action => action.kind === 'deck';
const isCell = action => action.kind === 'cell';
const isPass = action => action.type === 'UI_OK';

/**
 * Фикстура с «начатым» ходом: без `_enteredHooks` и `turn.index` lifecycle переигрывает начало хода
 * и окно перемещения закрывается само — состояния были бы не те, что в партии.
 */
const baseState = (patch = {}) =>
  createState({
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
    ...patch,
  });

/** Ход игрока 0, и у alpha есть цель в дистанции удара (дальность 2 до beta). */
const attackReady = () => {
  const state = baseState();
  player(state, '0').fighters.find(fighter => fighter.id === 'alpha').attackRange = 2;
  return state;
};

/** Защита игрока 1: игрок 0 объявил атаку картой `atk` и выбрал цель. */
const defenseWindow = () => {
  let state = attackReady();
  state = runAction(state, { type: 'PICK', kind: 'card', id: 'atk_0', playerId: '0' });
  state = runAction(state, { type: 'PICK', kind: 'fighter', id: 'beta', playerId: '0' });
  return state;
};

/** Окно перемещения: линия длиннее, beta стоит дальше — есть куда и зачем шагнуть. */
const moveMap = {
  id: 'move',
  name: 'Move',
  nodes: [8, 9, 10, 11].map((id, index, list) => ({
    id,
    terrain: 'ice',
    x: index,
    y: 0,
    neighbors: [list[index - 1], list[index + 1]].filter(neighbour => neighbour != null),
  })),
};

const movementWindow = () => {
  const state = baseState({ map: moveMap });
  player(state, '1').fighters[0].currentPosition = 11;
  return runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' });
};

describe('политики: выбор действия', () => {
  it('есть чем ударить — greedy бьёт, random сохраняет разброс для покрытия', () => {
    const state = attackReady();

    const greedy = actionsFor(state, '0', { policy: 'greedy' });
    expect(weightOf(greedy, isCard('atk_0'))).toBeGreaterThan(weightOf(greedy, isDeck));

    const random = actionsFor(state, '0', { policy: 'random' });
    expect(weightOf(random, isCard('atk_0'))).toBeGreaterThan(0);
    expect(weightOf(random, isDeck)).toBeGreaterThan(0);
  });

  it('темп: `trade` давит, когда моя колода короче, и бережёт карту, когда длиннее', () => {
    const behind = attackReady();
    // моя колода пустеет, чужая цела: тянуть нельзя — каждый добор приближает моё истощение
    player(behind, '0').deck.cards = [];
    player(behind, '1').deck.cards = Array.from({ length: 12 }, (_, index) =>
      fixtureCard({ id: `foe_${index}` }),
    );
    const pressing = actionsFor(behind, '0', { policy: 'trade' });

    const ahead = attackReady();
    // наоборот: колода соперника пустеет — время на моей стороне, размен невыгоден
    player(ahead, '0').deck.cards = Array.from({ length: 12 }, (_, index) =>
      fixtureCard({ id: `mine_${index}` }),
    );
    player(ahead, '1').deck.cards = [];
    const patient = actionsFor(ahead, '0', { policy: 'trade' });

    // атака и добор сравниваются внутри одного решения: позади — атака дороже, впереди — дешевле
    const pressGap = weightOf(pressing, isCard('atk_0')) - weightOf(pressing, isDeck);
    const patientGap = weightOf(patient, isCard('atk_0')) - weightOf(patient, isDeck);

    expect(pressGap).toBeGreaterThan(patientGap);
  });

  it('условия карты меняют выбор: «Погребальный звон» в покое сильнее карты на 4', () => {
    const state = attackReady();
    const anubis = player(state, '0');
    anubis.heroId = 'anubis';
    anubis.fighters.find(fighter => fighter.id === 'alpha').id = 'anubis';
    anubis.hand.cards = [
      { ...cardById('anubis_01'), instanceId: 'bell_0' },
      fixtureCard({ id: 'plain_04', type: 'attack', value: 4, bonus: 1, fighter: 'anubis' }),
    ];

    // по напечатанному числу карта на 4 сильнее (3 против 4) — так выбирает `greedy`
    const greedy = actionsFor(state, '0', { policy: 'greedy' });
    expect(weightOf(greedy, isCard('plain_04_0'))).toBeGreaterThan(
      weightOf(greedy, isCard('bell_0')),
    );

    // политика `conditions` читает правило карты: пока Анубис не двигался, звон — это 5
    const conditions = actionsFor(state, '0', { policy: 'conditions' });
    expect(weightOf(conditions, isCard('bell_0'))).toBeGreaterThan(
      weightOf(conditions, isCard('plain_04_0')),
    );
  });

  it('защита: карта предлагается всегда, greedy её предпочитает пасу', () => {
    const state = defenseWindow();
    expect(runUi(state, '1').phase).toBe('defense');

    const greedy = actionsFor(state, '1', { policy: 'greedy' });
    expect(weightOf(greedy, isCard('bdef_0'))).toBeGreaterThan(weightOf(greedy, isPass));

    // случайный бот тоже видит защиту картой: иначе фаззинг не доходил бы до этих правил вовсе
    const random = actionsFor(state, '1', { policy: 'random' });
    expect(weightOf(random, isCard('bdef_0'))).toBeGreaterThan(0);
    expect(weightOf(random, isPass)).toBeGreaterThan(0);
  });

  it('окно перемещения «ходят все» (`fighters: null`) не остаётся без шагов', () => {
    const state = movementWindow();
    expect(state.movement?.fighters).toBeNull();

    const options = actionsFor(state, '0', { policy: 'greedy' });
    const steps = options.filter(option => isCell(option.action));
    expect(steps.length).toBeGreaterThan(0);
    // шаг в сторону врага весит больше, чем «закончить перемещение»
    expect(Math.max(...steps.map(step => step.weight))).toBeGreaterThan(weightOf(options, isPass));
  });

  it('«шагов в никуда» нет: топтание на месте не предлагается (вес 0)', () => {
    const state = movementWindow();

    const options = actionsFor(state, '0', { policy: 'greedy' });

    // любой предложенный шаг — прогресс: либо выход на удар, либо сокращение дистанции
    for (const option of options.filter(entry => isCell(entry.action))) {
      expect(option.weight).toBeGreaterThan(0);
    }
  });

  /**
   * Линия 8—9—10—11—12: alpha (достаёт на 3) стоит вплотную к beta (достаёт на 1), поэтому у него
   * есть куда отойти. Клетка 12 — своя стихия Анубиса (пустыня).
   */
  const kiteMap = {
    id: 'kite',
    name: 'Kite',
    nodes: [8, 9, 10, 11, 12].map((id, index, list) => ({
      id,
      terrain: id === 12 ? 'desert' : 'ice',
      x: index,
      y: 0,
      neighbors: [list[index - 1], list[index + 1]].filter(neighbour => neighbour != null),
    })),
  };

  const kiteWindow = heroId => {
    const state = baseState({ map: kiteMap });
    const own = player(state, '0');
    own.heroId = heroId;
    own.fighters.find(fighter => fighter.id === 'alpha').currentPosition = 10;
    own.fighters.find(fighter => fighter.id === 'alpha').attackRange = 3;
    own.fighters.find(fighter => fighter.id === 'pawn').currentPosition = 8;
    player(state, '1').fighters[0].currentPosition = 9;
    return runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' });
  };

  const cellWeight = (options, cellId) =>
    weightOf(options, action => isCell(action) && Number(action.id) === Number(cellId));

  it('кайт считается по всем врагам: помощник с дальностью 1 не повод подставиться под героя', () => {
    const state = kiteWindow(undefined);
    const enemy = player(state, '1');
    // герой уходит дальше, но достаёт на 3 — «безопасных» клеток рядом нет вовсе
    enemy.fighters[0].currentPosition = 12;
    enemy.fighters[0].attackRange = 3;
    enemy.fighters.push(
      fighter({ id: 'minion', type: 'assistant', attackRange: 1, currentPosition: 9 }),
    );

    const weights = actionsFor(state, '0', { policy: 'greedy' })
      .filter(entry => isCell(entry.action))
      .map(entry => entry.weight);

    // шага «из-под удара» (вес `stepAway` = 7) быть не должно: герой достаёт отовсюду поблизости
    expect(weights).not.toContain(7);
  });

  it('позиция: дальнобойный боец отходит из-под удара и встаёт на свою стихию', () => {
    const greedy = actionsFor(kiteWindow('anubis'), '0', { policy: 'greedy' });

    // шаг из-под удара: beta достаёт на 1, а мы бьём и с 11, и с 12
    expect(cellWeight(greedy, 11)).toBeGreaterThan(0);
    // своя стихия (пустыня у Анубиса) добавляет премию к тому же шагу
    expect(cellWeight(greedy, 12)).toBeGreaterThan(cellWeight(greedy, 11));

    // эталон позицию не оценивает: отходить «в никуда» он не станет, стихия ему тоже не подсказка
    const cards = actionsFor(kiteWindow('anubis'), '0', { policy: 'cards' });
    expect(cellWeight(cards, 11)).toBe(0);
    expect(cellWeight(cards, 12)).toBe(0);
  });

  it('неизвестная политика — ошибка, а не тихий `random`', () => {
    expect(policyNames).toContain('greedy');
    expect(() => weightsFor('chess')).toThrow(/политика/);
    expect(weightsFor('random').attack).toBeGreaterThan(0);
    expect(policies.greedy({ canAttack: false }).draw).toBeGreaterThan(
      policies.greedy({ canAttack: true }).draw,
    );
  });

  it('рука на исходе — добор важнее удара: карта это топливо и на бой, и на защиту', () => {
    const state = attackReady();
    // оставляем одну карту: удар потратит последнюю, и следующий ход будет пустым
    player(state, '0').hand.cards = [player(state, '0').hand.cards[0]];

    const options = actionsFor(state, '0', { policy: 'greedy' });

    expect(weightOf(options, isDeck)).toBeGreaterThan(weightOf(options, isCard('atk_0')));
  });

  it('вес траты падает с ростом бонуса: сильные карты берегутся', () => {
    const weights = weightsFor('greedy', { hand: 3, canDraw: true });

    expect(cardCostWeight({ bonus: 1 }, weights)).toBeGreaterThan(
      cardCostWeight({ bonus: 4 }, weights),
    );
    // случайный бот карты не оценивает — все равны, чтобы фаззинг пробовал разные
    expect(cardCostWeight({ bonus: 4 }, weightsFor('random'))).toBe(1);
  });

  it('цель: раненого добивают, герой важнее помощника', () => {
    const weights = weightsFor('greedy', { hand: 3, canDraw: true });

    expect(targetWeight({ type: 'hero', currentHp: 10 }, weights)).toBeGreaterThan(
      targetWeight({ type: 'assistant', currentHp: 8 }, weights),
    );
    expect(targetWeight({ type: 'hero', currentHp: 2 }, weights)).toBeGreaterThan(
      targetWeight({ type: 'hero', currentHp: 10 }, weights),
    );
  });

  it('удар: сильная карта бьёт больнее, но добивать выгоднее той, которой ровно хватает', () => {
    const greedy = weightsFor('greedy', { hand: 3, canDraw: true });
    const economy = weightsFor('economy', { hand: 3, canDraw: true });
    const deck = { average: 3 };

    // цели в дистанции нет — сравнивать нечего, сильная карта лучше
    expect(attackWeight({ value: 5 }, greedy, { ...deck, weakness: 0 })).toBeGreaterThan(
      attackWeight({ value: 2 }, greedy, { ...deck, weakness: 0 }),
    );
    // враг на 2 hp: карта на 2 добивает ровно, карта на 5 — та же цель и переплата силой
    expect(attackWeight({ value: 2 }, greedy, { ...deck, weakness: 2 })).toBeGreaterThan(
      attackWeight({ value: 5 }, greedy, { ...deck, weakness: 2 }),
    );
    // оценка относительна своей колоде и ограничена: сильная карта не перевешивает решение «добрать»
    expect(attackWeight({ value: 5 }, greedy, deck)).toBeLessThanOrEqual(15);
    // эталон без признаков карты: все карты атаки равны
    expect(attackWeight({ value: 2 }, economy, { ...deck, weakness: 2 })).toBe(
      attackWeight({ value: 5 }, economy, { ...deck, weakness: 2 }),
    );
  });

  it('условия карты: эффективное число и обещанная польза платятся только геном `condition`', () => {
    const greedy = weightsFor('greedy', { hand: 3, canDraw: true });
    const conditions = weightsFor('conditions', { hand: 3, canDraw: true });
    const deck = { average: 4 };

    // «Погребальный звон» — та же карта (3), но при покое её число 5: весит больше
    expect(attackWeight({ value: 4 }, conditions, { ...deck, strength: 5 })).toBeGreaterThan(
      attackWeight({ value: 4 }, conditions, deck),
    );
    // у `greedy` ген нулевой: эффективное число политика не оплачивает
    expect(attackWeight({ value: 4 }, greedy, { ...deck, strength: 5 })).toBe(
      attackWeight({ value: 4 }, greedy, deck),
    );
    // обещанная польза (сброс чужой карты) — премия гена `condition`
    expect(attackWeight({ value: 4 }, conditions, { ...deck, promise: 1.5 })).toBeGreaterThan(
      attackWeight({ value: 4 }, conditions, deck),
    );
    expect(attackWeight({ value: 4 }, greedy, { ...deck, promise: 1.5 })).toBe(
      attackWeight({ value: 4 }, greedy, deck),
    );
  });

  it('защита: закрываем объявленное число и не переплачиваем силой карты', () => {
    const greedy = weightsFor('greedy', { hand: 3, canDraw: true });
    const economy = weightsFor('economy', { hand: 3, canDraw: true });

    expect(defenseWeight({ value: 3 }, greedy, { threat: 3 })).toBeGreaterThan(
      defenseWeight({ value: 5 }, greedy, { threat: 3 }),
    );
    // карта слабее удара всё равно полезна: она уменьшает урон
    expect(defenseWeight({ value: 2 }, greedy, { threat: 5 })).toBeGreaterThan(0);
    expect(defenseWeight({ value: 5 }, economy, { threat: 3 })).toBe(
      defenseWeight({ value: 3 }, economy, { threat: 3 }),
    );
  });

  it('вариант свойства: полезный предпочитается, пустая трата ресурса не предлагается', () => {
    const greedy = weightsFor('greedy', { hand: 3, canDraw: true });

    expect(optionWeight({ value: 4, cost: 1 }, greedy)).toBeGreaterThan(
      optionWeight({ value: 0, cost: 1 }, greedy),
    );
    expect(optionWeight({ value: 0, cost: 1 }, greedy)).toBe(0);
    // бесплатный вариант остаётся в списке даже без пользы: отказываться от него нечего
    expect(optionWeight({ value: 0, cost: 0 }, greedy)).toBeGreaterThan(0);
    // эталоны свойства не оценивают: все варианты равны, редкие ступени проверяются
    expect(optionWeight({ value: 0, cost: 2 }, weightsFor('economy'))).toBe(1);
    expect(optionWeight({ value: 4, cost: 1 }, weightsFor('random'))).toBe(1);
  });

  it('карта с меткой ресурса героя — вложение, а не топливо: сброс осколка не штрафуется', () => {
    const greedy = weightsFor('greedy', { hand: 3, canDraw: true });

    // осколок Снежной королевы уходит в сброс охотнее сильной карты без метки
    expect(cardCostWeight({ bonus: 4, tags: ['shard'] }, greedy, { fuels: true })).toBeGreaterThan(
      cardCostWeight({ bonus: 4 }, greedy, { fuels: false }),
    );
    // эталон без признаков карты метку не читает
    expect(
      cardCostWeight({ bonus: 4, tags: ['shard'] }, weightsFor('economy'), { fuels: true }),
    ).toBe(cardCostWeight({ bonus: 4 }, weightsFor('economy'), { fuels: false }));
  });

  it('эталоны заморожены: `economy` без признаков карты и свойства, `random` без оценки вообще', () => {
    for (const name of ['economy', 'basic', 'random']) {
      const weights = weightsFor(name, { hand: 3, canDraw: true, canAttack: true });
      expect(weights.cardValue, name).toBe(0);
      expect(weights.option, name).toBe(0);
    }
    // признаки этапа §13 включает только `greedy`
    expect(weightsFor('greedy', { hand: 3 }).cardValue).toBeGreaterThan(0);
    expect(weightsFor('greedy', { hand: 3 }).option).toBeGreaterThan(0);
  });

  it('шаг: кайтить может тот, кто достаёт дальше, а шаг на свою стихию получает премию', () => {
    const greedy = weightsFor('greedy', { hand: 3, canDraw: true });
    const cards = weightsFor('cards', { hand: 3, canDraw: true });

    // выход из-под удара — это вес `stepAway`, а не «шаг в никуда»
    expect(movementWeight(greedy, { kind: 'away' })).toBeGreaterThan(0);
    expect(movementWeight(greedy, { kind: 'away' })).toBeGreaterThan(
      movementWeight(greedy, { kind: 'idle' }),
    );
    // эталон позицию не оценивает: шаг из-под удара остаётся «в никуда» — не предлагается
    expect(movementWeight(cards, { kind: 'away' })).toBe(0);
    // своя стихия добавляет премию поверх любого вида шага
    expect(movementWeight(greedy, { kind: 'closer', affinity: true })).toBeGreaterThan(
      movementWeight(greedy, { kind: 'closer' }),
    );
    expect(movementWeight(cards, { kind: 'closer', affinity: true })).toBe(
      movementWeight(cards, { kind: 'closer' }),
    );
  });

  it('удержание позиции: на выгодном месте `greedy` охотнее заканчивает маневр', () => {
    const greedy = weightsFor('greedy', { hand: 3, canDraw: true });
    const cards = weightsFor('cards', { hand: 3, canDraw: true });

    expect(holdWeight(greedy, { good: true })).toBeGreaterThan(holdWeight(greedy, {}));
    expect(holdWeight(greedy, { affinity: true })).toBeGreaterThan(holdWeight(greedy, {}));
    // «закончить, когда идти некуда» и «закончить, когда есть куда» остаются разными весами
    expect(holdWeight(greedy, { useful: true })).toBeLessThan(holdWeight(greedy, {}));
    expect(holdWeight(cards, { good: true })).toBe(holdWeight(cards, {}));
  });

  it('усталость: на исходе колоды добор дешевеет, но пустая рука важнее запаса', () => {
    const greedy = weightsFor('greedy', { hand: 4, canDraw: true, canAttack: false });
    const cards = weightsFor('cards', { hand: 4, canDraw: true, canAttack: false });

    expect(drawWeight(greedy, { fuel: 5, hand: 4 })).toBeLessThan(
      drawWeight(greedy, { fuel: 20, hand: 4 }),
    );
    expect(drawWeight(greedy, { fuel: 0, hand: 4 })).toBe(0);
    // рука на исходе: добор нужен любой ценой, истощение — потом
    const starving = weightsFor('greedy', { hand: 1, canDraw: true, canAttack: false });
    expect(drawWeight(starving, { fuel: 1, hand: 1 })).toBe(starving.draw);
    // эталон запас колоды не смотрит
    expect(drawWeight(cards, { fuel: 0, hand: 4 })).toBe(cards.draw);
  });

  it('позиционные признаки включает только `greedy`: `cards` — прежний жадный', () => {
    const cards = weightsFor('cards', { hand: 3, canDraw: true });
    for (const gene of ['stepAway', 'hold', 'terrain', 'fatigue'])
      expect(cards[gene], gene).toBe(0);

    const greedy = weightsFor('greedy', { hand: 3, canDraw: true });
    for (const gene of ['stepAway', 'hold', 'terrain', 'fatigue']) {
      expect(greedy[gene], gene).toBeGreaterThan(0);
    }
  });
});

/**
 * Окно на несколько целей («выберите 2 из 3»): ядро решений обязано предлагать клики по **неотмеченным**
 * целям, пока набор не собран, и подтверждение (`UI_OK`) после него. Иначе окно либо не закрывается вовсе,
 * либо бот кликает по уже отмеченной цели — и движок отказывает («цель уже отмечена»).
 */
const multiMap = {
  id: 'multi',
  name: 'Multi',
  nodes: [8, 9, 10, 11].map((id, index, list) => ({
    id,
    terrain: 'ice',
    x: index,
    y: 0,
    neighbors: [list[index - 1], list[index + 1]].filter(neighbour => neighbour != null),
  })),
};

/** Карта «отметьте два из трёх»: три эффекта, из которых игрок выбирает два. */
const multiOptionCard = {
  id: 'test_choice',
  instanceId: 'test_choice_1',
  title: 'Три обещания',
  type: 'effect',
  value: 0,
  bonus: 1,
  options: [
    { id: 'draw', text: 'добор' },
    { id: 'heal', text: 'лечение' },
    { id: 'strike', text: 'удар' },
  ],
  rules: [
    {
      moment: 'effect',
      then: [
        {
          action: 'SET_TARGETING',
          op: 'open',
          kind: 'options',
          candidates: [
            { optionId: 'draw', title: 'добор' },
            { optionId: 'heal', title: 'лечение' },
            { optionId: 'strike', title: 'удар' },
          ],
          count: 2,
          required: true,
        },
      ],
    },
    {
      moment: 'picked',
      when: [{ fact: 'PICKED', params: { is: 'draw' } }],
      then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
    },
    {
      moment: 'picked',
      when: [
        { fact: 'PICKED', params: { is: 'heal' } },
        { fact: 'FIGHTERS', params: { side: 'self' }, var: 'mine' },
      ],
      then: [{ action: 'SET_HEALTH', fighterIds: '$mine', delta: 2 }],
    },
    {
      moment: 'picked',
      when: [
        { fact: 'PICKED', params: { is: 'strike' } },
        { fact: 'FIGHTERS', params: { side: 'opponent' }, var: 'foes' },
      ],
      then: [{ action: 'SET_HEALTH', fighterIds: '$foes', delta: -1 }],
    },
  ],
};

/** Карта «отметьте двух вражеских бойцов»: у окна настоящий выбор из трёх. */
const multiFighterCard = {
  id: 'test_pair',
  instanceId: 'test_pair_1',
  title: 'Двойной удар',
  type: 'effect',
  value: 0,
  bonus: 1,
  rules: [
    {
      moment: 'effect',
      when: [{ fact: 'FIGHTERS', params: { side: 'opponent' }, var: 'foes' }],
      then: [
        { action: 'SET_TARGETING', op: 'open', candidates: '$foes', count: 2, required: true },
      ],
    },
    {
      moment: 'picked',
      when: [{ fact: 'PICKED', var: 'picked' }],
      then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 }],
    },
  ],
};

/** Ход с тремя врагами: карта разыграна, окно на две цели открыто. */
const multiWindow = card1 => {
  const state = baseState({ map: multiMap });
  const owner = player(state, '0');
  owner.hand.cards = [card1];
  const enemy = player(state, '1');
  enemy.fighters[0].currentPosition = 9;
  enemy.fighters.push(
    fighter({ id: 'gamma', name: 'gamma', type: 'assistant', currentPosition: 10, currentHp: 5 }),
    fighter({ id: 'delta', name: 'delta', type: 'assistant', currentPosition: 11, currentHp: 5 }),
  );
  return runAction(state, { type: 'PICK', kind: 'card', id: card1.instanceId, playerId: '0' });
};

const picksOf = options => options.filter(option => option.action.type === 'PICK');
const hpOf = (state, fighterId) =>
  player(state, '1').fighters.find(entry => entry.id === fighterId).currentHp;

describe('окно на несколько целей: ядро решений доводит набор до конца', () => {
  it('варианты свойства: клики по неотмеченным, затем подтверждение', () => {
    let state = multiWindow(multiOptionCard);
    expect(state.targeting).toMatchObject({ kind: 'options', count: 2, required: true });

    const first = actionsFor(state, '0', { policy: 'greedy' });
    expect(picksOf(first).map(option => option.action.id)).toEqual(['draw', 'heal', 'strike']);
    // набор не собран: подтверждать нечего, и общего отказа у обязательного окна нет
    expect(first.some(option => option.action.type === 'UI_OK')).toBe(false);

    state = runAction(state, { ...picksOf(first)[0].action, playerId: '0' });
    expect(state.targeting).toMatchObject({ picked: ['draw'], complete: false });

    const second = actionsFor(state, '0', { policy: 'greedy' });
    expect(picksOf(second).map(option => option.action.id)).toEqual(['heal', 'strike']);
    expect(second.some(option => option.action.type === 'UI_OK')).toBe(false);

    state = runAction(state, { ...picksOf(second)[0].action, playerId: '0' });
    expect(state.targeting).toMatchObject({ picked: ['draw', 'heal'], complete: true });

    const done = actionsFor(state, '0', { policy: 'greedy' });
    expect(done.map(option => option.action.type)).toEqual(['UI_OK']);

    state = runAction(state, { type: 'UI_OK', playerId: '0' });
    expect(state.targeting ?? null).toBeNull();
    expect(state.effect ?? null).toBeNull();
  });

  it('бойцы: две отметки подряд, затем подтверждение — урон по обоим отмеченным', () => {
    let state = multiWindow(multiFighterCard);
    expect(state.targeting).toMatchObject({ kind: 'fighters', count: 2, required: true });

    const seen = [];
    while (state.targeting && state.targeting.complete !== true) {
      const offers = picksOf(actionsFor(state, '0', { policy: 'greedy' }));
      expect(offers.length).toBeGreaterThan(0);
      seen.push(offers[0].action.id);
      state = runAction(state, { ...offers[0].action, playerId: '0' });
    }

    // бот отметил двух разных бойцов и ни разу не повторился: третий остался нетронутым
    expect(seen).toHaveLength(2);
    expect(new Set(seen).size).toBe(2);
    expect(seen).toEqual(['beta', 'gamma']);

    const done = actionsFor(state, '0', { policy: 'greedy' });
    expect(done.map(option => option.action.type)).toEqual(['UI_OK']);

    state = runAction(state, { type: 'UI_OK', playerId: '0' });
    expect(state.targeting ?? null).toBeNull();
    expect(hpOf(state, 'beta')).toBe(12);
    expect(hpOf(state, 'gamma')).toBe(4);
    expect(hpOf(state, 'delta')).toBe(5);
  });
});

/**
 * Экономика руки в **живой** политике (`trade` — она перечисляет варианты и в браузере, и в замерах).
 *
 * Два механизма:
 * - **сушка руки**: добор при полной руке — карта из колоды сразу в сброс (в конце хода рука
 *   сбрасывается до лимита), поэтому вес добора падает ровно на ту долю, что не влезет;
 * - **бомба истощения**: у соперника в колоде последняя карта и его запас тоньше нашего — его маневр
 *   станет добором на пустой колоде (2 урона всем его бойцам), поэтому бой дешевеет, а отход дорожает.
 */
describe('рука: сушка перебора и бомба истощения', () => {
  it('позиционные гены у живой политики не нулевые: кайт, удержание, стихия и усталость включены', () => {
    const trade = weightsFor('trade', { hand: 3, canDraw: true, fuel: 10, rivalFuel: 10 });
    for (const gene of ['stepAway', 'hold', 'terrain', 'fatigue'])
      expect(trade[gene], gene).toBeGreaterThan(0);
    // шаг «из-под удара» герою предлагается: вес вида шага берётся у политики, а не у базы
    expect(movementWeight(trade, { kind: 'away' })).toBeGreaterThan(0);
  });

  it('сушка руки: при полной руке вес добора падает, но маневр остаётся возможным', () => {
    const trade = weightsFor('trade', { hand: 7, canDraw: true, fuel: 20, rivalFuel: 20 });
    const full = drawWeight(trade, { hand: 7, handLimit: 7, fuel: 20 });

    // маневр — это ещё и перемещение, поэтому не ноль: вычет, а не запрет
    expect(full).toBeGreaterThan(0);
    expect(full).toBeLessThan(trade.draw);
    // один слот есть — вес не тронут: добранная карта влезет
    expect(drawWeight(trade, { hand: 6, handLimit: 7, fuel: 20 })).toBe(trade.draw);
    expect(drawWeight(trade, { hand: 3, handLimit: 7, fuel: 20 })).toBe(trade.draw);
    // лимит поставлен умением («Вечная мерзлота» даёт 5 врагам королевы): полная рука при пяти
    expect(drawWeight(trade, { hand: 5, handLimit: 5, fuel: 20 })).toBe(full);
    // пустая рука важнее перебора: без карт боец не бьёт и не защищается, а место в руке есть
    expect(drawWeight(trade, { hand: 1, handLimit: 7, fuel: 20 })).toBe(trade.draw);
  });

  it('бомба истощения: тонкая чужая колода снимает тягу к размену и поднимает отход', () => {
    const calm = weightsFor('trade', { hand: 3, canDraw: true, fuel: 12, rivalFuel: 8 });
    const bomb = weightsFor('trade', { hand: 3, canDraw: true, fuel: 12, rivalFuel: 1 });

    expect(bomb.attack).toBeLessThan(calm.attack);
    expect(bomb.stepAway).toBeGreaterThan(calm.stepAway);
    // бой не выключается целиком: добивать всё равно придётся
    expect(bomb.attack).toBeGreaterThan(0);
    // бомбы нет, когда колода соперника не тоньше нашей: размен колодами проиграем сами
    const even = weightsFor('trade', { hand: 3, canDraw: true, fuel: 1, rivalFuel: 1 });
    expect(even.attack).toBeGreaterThan(0);
    expect(even.stepAway).toBeLessThan(bomb.stepAway);
    // и когда у него колода ещё не на последней карте
    const early = weightsFor('trade', { hand: 3, canDraw: true, fuel: 12, rivalFuel: 4 });
    expect(early.attack).toBeGreaterThan(bomb.attack);
  });
});

/**
 * Выбор **своего** атакующего: раньше все свои были равны (`pick`), поэтому в бой одинаково охотно шёл и
 * полный герой, и помощник с одним здоровьем — решал только роллаут. Теперь полного посылают охотнее, а
 * важного помощника (на нём держится механика пака) в размен не отдают.
 */
describe('кто бьёт: здоровье и важность помощника', () => {
  const trade = () => weightsFor('trade', { hand: 3, canDraw: true, fuel: 12, rivalFuel: 8 });
  const fighter = patch => ({
    type: 'assistant',
    currentHp: 4,
    startHp: 4,
    ...patch,
  });

  it('полный боец охотнее раненого, герой — без поправки на важность', () => {
    const weights = trade();
    const full = attackerWeight(weights, fighter({ currentHp: 4, startHp: 4 }));
    const half = attackerWeight(weights, fighter({ currentHp: 2, startHp: 4 }));
    const hero = attackerWeight(weights, fighter({ type: 'hero', currentHp: 2, startHp: 4 }));

    expect(full).toBeGreaterThan(half);
    expect(full).toBeGreaterThan(weights.pick);
    // у героя важность не учитывается, поэтому он весит столько же, сколько помощник тех же hp
    expect(hero).toBe(half);
  });

  it('важного помощника в размен не отдают', () => {
    const weights = trade();
    const body = attackerWeight(weights, fighter({}), { importance: 0 });
    const key = attackerWeight(weights, fighter({}), { importance: 1 });

    expect(key).toBeLessThan(body);
  });

  it('без бойца и на нулевом здоровье вес не ломается', () => {
    const weights = trade();

    // нет бойца — базовый вес: окно не должно оставаться без вариантов
    expect(attackerWeight(weights, null)).toBe(weights.pick);
    // приговорённый (0 hp) всё ещё получает вес: это перевес между своими, а не запрет бить
    expect(attackerWeight(weights, fighter({ currentHp: 0, startHp: 4 }))).toBeGreaterThan(0);
  });
});

/**
 * Запас защит (`defenseStock`, `.docs/bot-strategies.md` п. 3). Гибрид — и удар, и защита: бить им,
 * когда защитных карт в руке и колоде почти не осталось, значит отдать последний щит в обмен, на
 * который ответят картой. Ген `stock`: ноль возвращает прежнее поведение.
 */
describe('запас защит: последний гибрид не уходит в атаку', () => {
  const trade = () => weightsFor('trade', { hand: 3, canDraw: true, fuel: 12, rivalFuel: 8 });
  const hybridCard = { type: 'hybrid', value: 4, bonus: 2 };
  const attackCard = { type: 'attack', value: 4, bonus: 2 };
  const fight = {
    average: 3,
    weakness: 0,
    hp: 12,
    threat: 4,
    fuel: 12,
    rivalFuel: 8,
    rivalCards: 4,
  };

  it('гибрид дешевеет только при пустом запасе и полной чужой руке', () => {
    const weights = trade();

    expect(stockFactor(weights, { stock: 3, hybrid: true, rivalCards: 4 })).toBe(1);
    expect(stockFactor(weights, { stock: 1, hybrid: true, rivalCards: 4 })).toBeLessThan(1);
    // не гибрид — не штрафуется: обычную атаку защищать было нельзя
    expect(stockFactor(weights, { stock: 0, hybrid: false, rivalCards: 4 })).toBe(1);
    // ответа не будет (рука соперника коротка) — беречь щит незачем
    expect(stockFactor(weights, { stock: 0, hybrid: true, rivalCards: 2 })).toBe(1);
  });

  it('вес атаки гибридом падает, вес атаки обычной картой — нет', () => {
    const weights = trade();

    expect(attackWeight(hybridCard, weights, { ...fight, stock: 0 })).toBeLessThan(
      attackWeight(hybridCard, weights, { ...fight, stock: 3 }),
    );
    expect(attackWeight(attackCard, weights, { ...fight, stock: 0 })).toBe(
      attackWeight(attackCard, weights, { ...fight, stock: 3 }),
    );
  });

  it('своя механика карты поднимает её цену в окне траты', () => {
    const weights = trade();

    // «отмену» и «добор» на усиление шага почти не сбрасывают: своя польза вычитается из охоты тратить
    expect(cardCostWeight({ type: 'hybrid', bonus: 1 }, weights, { own: 3 })).toBeLessThan(
      cardCostWeight({ type: 'hybrid', bonus: 1 }, weights),
    );
    // ниже единицы вес не падает: сжечь карту всё равно можно
    expect(cardCostWeight({ type: 'hybrid', bonus: 1 }, weights, { own: 100 })).toBe(1);
  });
});

/**
 * Приманка помощником (`.docs/bot-strategies.md` п. 2): слабый удар дешёвого помощника по полной чужой
 * руке выбивает ответ, поэтому риск ответного удара за него считается иначе. Ген `bait`.
 */
describe('приманка: слабая карта помощника по полной чужой руке', () => {
  // веса заданы явно: проверяется множитель риска, а не конкретная политика
  const weights = { attack: 10, cardValue: 1, tradeRisk: 0.5, condition: 0 };
  const weak = { type: 'attack', value: 2, bonus: 1 };

  it('условия приманки: помощник, слабая карта, 4+ карты у соперника', () => {
    const helper = { attackerType: 'assistant', card: weak, rivalCards: 5 };

    expect(baitFactor(weights, helper)).toBeGreaterThan(0);
    // важный помощник в приманку не идёт: на нём держится механика пака
    expect(baitFactor(weights, { ...helper, attackerImportant: 0.8 })).toBe(0);
    // герой — не приманка
    expect(baitFactor(weights, { ...helper, attackerType: 'hero' })).toBe(0);
    // сильная карта нужна для удара, а не для выбивания ответа
    expect(baitFactor(weights, { ...helper, card: { type: 'attack', value: 5 } })).toBe(0);
    // короткая чужая рука: ответа не будет, беречь нечего
    expect(baitFactor(weights, { ...helper, rivalCards: 2 })).toBe(0);
  });

  it('вес удара помощника выше, чем героя, при тех же условиях', () => {
    const fight = { average: 3, hp: 1, threat: 4, rivalCards: 5, stock: 5 };

    expect(attackWeight(weak, weights, { ...fight, attackerType: 'assistant' })).toBeGreaterThan(
      attackWeight(weak, weights, { ...fight, attackerType: 'hero', attackerImportant: 1 }),
    );
  });
});

/**
 * Порог перевеса по здоровью (`.docs/bot-strategies.md` п. 9): при явном перевесе партию упрощают —
 * атака дорожает, при таком же отставании дешевеет. Ген `lead`.
 */
describe('порог перевеса по здоровью', () => {
  const weights = { attack: 10, cardValue: 1, tradeWound: 0.5, condition: 0 };
  const card = { type: 'attack', value: 4, bonus: 1 };
  const fight = { average: 3, hp: 12, threat: 3 };

  it('порог в 5 hp: выше — множитель больше единицы, ниже — ровно единица', () => {
    expect(leadFactor(weights, { mine: 15, theirs: 10 })).toBeGreaterThan(1);
    expect(leadFactor(weights, { mine: 14, theirs: 10 })).toBe(1);
    expect(leadFactor(weights, { mine: 10, theirs: 15 })).toBeLessThan(1);
    expect(leadFactor(weights, { mine: 10, theirs: 10 })).toBe(1);
  });

  it('при перевесе удар весит больше, чем при равенстве', () => {
    const ahead = attackWeight(card, weights, { ...fight, material: { mine: 18, theirs: 10 } });
    const even = attackWeight(card, weights, { ...fight, material: { mine: 10, theirs: 10 } });
    const behind = attackWeight(card, weights, { ...fight, material: { mine: 10, theirs: 18 } });

    expect(ahead).toBeGreaterThan(even);
    expect(behind).toBeLessThan(even);
  });
});

/**
 * Пункты 5–8 очереди (`.docs/bot-strategies.md`) и хвост «б»: позиция в **симуляции** поиска, опасная
 * дистанция, отмены по остатку колоды, чужая стихия, перекрытие пути чужого героя и теснота вокруг него.
 */
describe('позиция в роллауте: кайт и бомба истощения (п. 5)', () => {
  const situation = { fuel: 10, rivalFuel: 14, hand: 4 };

  it('доигрывание видит уход из-под удара, удержание позиции, свою землю и цену добора', () => {
    const rollout = weightsFor('aggressive', situation);
    const live = weightsFor('trade', situation);

    expect(rollout.stepAway).toBeGreaterThan(0);
    expect(rollout.hold).toBeGreaterThan(0);
    expect(rollout.terrain).toBeGreaterThan(0);
    expect(rollout.fatigue).toBeGreaterThan(0);
    // агрессия роллаута осталась: бой он всё равно ценит выше живой политики
    expect(rollout.attack).toBeGreaterThan(live.attack);
    // а кайт в симуляции не дороже живого: доигрывание всё-таки агрессивнее
    expect(rollout.stepAway).toBeLessThanOrEqual(live.stepAway);
    // обещание карт в роллаут не входит: там своя цена и своя скорость
    expect(rollout.condition).toBeUndefined();
  });

  it('вес шага в симуляции: уход предлагается, топтание — нет', () => {
    const rollout = weightsFor('aggressive', situation);

    expect(movementWeight(rollout, { kind: 'away' })).toBeGreaterThan(0);
    expect(movementWeight(rollout, { kind: 'idle' })).toBe(0);
  });
});

describe('опасная дистанция без атаки (п. 7)', () => {
  const weights = weightsFor('trade', {});

  it('шаг в контакт, из которого не бьёшь, дешевле обычного сближения', () => {
    const plain = movementWeight(weights, { kind: 'closer' });
    const contact = movementWeight(weights, { kind: 'closer', noAttack: true });

    expect(contact).toBeLessThan(plain);
    // не вето: бывает, что подойти выгодно (перевес по колоде, дешёвая приманка)
    expect(contact).toBeGreaterThan(0);
  });

  it('опасная дистанция снимает и вес «шага в проход», но не обнуляет шаг', () => {
    const cover = movementWeight(weights, { kind: 'closer', guard: 1 });
    const risky = movementWeight(weights, { kind: 'closer', guard: 1, noAttack: true });

    expect(risky).toBeLessThan(cover);
    expect(risky).toBeGreaterThan(0);
  });
});

describe('чужая земля, путь и теснота (хвост «б», п. 8)', () => {
  const weights = weightsFor('trade', {});

  it('клетка чужой стихии, путь чужого героя и закрытый выход дают премию', () => {
    const plain = movementWeight(weights, { kind: 'closer' });

    expect(movementWeight(weights, { kind: 'closer', foeTerrain: true })).toBeGreaterThan(plain);
    expect(movementWeight(weights, { kind: 'closer', foeRoute: 1 })).toBeGreaterThan(plain);
    expect(movementWeight(weights, { kind: 'closer', foeRoom: 1 })).toBeGreaterThan(plain);
    expect(movementWeight(weights, { kind: 'closer', flee: 1 })).toBeGreaterThan(plain);
  });

  it('премия растёт с признаком, а не срабатывает как флаг', () => {
    expect(movementWeight(weights, { kind: 'closer', foeRoom: 1 })).toBeGreaterThan(
      movementWeight(weights, { kind: 'closer', foeRoom: 0.2 }),
    );
    // премия за путь не перебивает сам шаг: вес клетки остаётся в том же порядке
    expect(movementWeight(weights, { kind: 'closer', foeRoute: 1 })).toBeGreaterThan(
      movementWeight(weights, { kind: 'closer' }),
    );
  });
});

describe('отмены по остатку чужой колоды (п. 6)', () => {
  const weights = { ...weightsFor('trade', {}), tradeCards: 0, tradeRisk: 0, tradeWound: 0 };
  const card = { type: 'attack', value: 4, bonus: 1 };
  const fight = { average: 4, hp: 12, promise: 4, rivalCards: 4 };

  it('обещанная польза гасится вероятностью отмены', () => {
    const safe = attackWeight(card, weights, { ...fight, cancelRisk: 0 });
    const risky = attackWeight(card, weights, { ...fight, cancelRisk: 0.6 });
    const hopeless = attackWeight(card, weights, { ...fight, cancelRisk: 1 });

    expect(risky).toBeLessThan(safe);
    expect(hopeless).toBeLessThan(risky);
    // обещание не исчезает совсем: карта всё равно играется за своё число
    expect(hopeless).toBeGreaterThan(0);
  });

  it('без гена обещания нет — отмены не на что гасить', () => {
    const off = { ...weights, condition: 0 };

    expect(attackWeight(card, off, { ...fight, cancelRisk: 1 })).toBe(
      attackWeight(card, off, { ...fight, cancelRisk: 0 }),
    );
  });

  it('свою отмену не тратят на удар без свойств и без риска для бойца', () => {
    const cancel = { value: 3, bonus: 1 };
    const plainCard = { value: 3, bonus: 1 };
    const safe = { threat: 2, save: { type: 'hero', hp: 14, important: true } };

    expect(defenseWeight(cancel, weights, { ...safe, cancels: true })).toBeLessThan(
      defenseWeight(plainCard, weights, safe),
    );
    // карта спасает бойца — тут отмена уместна, штрафа нет
    const fatal = { threat: 10, save: { type: 'hero', hp: 6, important: true } };
    expect(defenseWeight(cancel, weights, { ...fatal, cancels: true })).toBe(
      defenseWeight(plainCard, weights, fatal),
    );
  });

  it('обещание, которое наступит позже в этом ходу, стоит в весе атаки', () => {
    const now = attackWeight(card, weights, fight);
    const early = attackWeight(card, weights, { ...fight, deferred: 3 });

    expect(early).toBeLessThan(now);
    expect(early).toBeGreaterThan(0);
  });
});

/**
 * Правило «последнего духа» (`.docs/bot-strategies.md`, Ифрит): умение платит жизнью духа за лишнее
 * действие, но пока жив хоть один дух, работают ступени пака («Пепельная стая», «Плата пеплом» на 6).
 * Клик по последнему духу поэтому дешевле, чем по одному из трёх.
 */
describe('жертва последнего духа', () => {
  const lineMap = {
    id: 'line',
    name: 'Line',
    nodes: [1, 2, 3, 4, 5].map((id, index, list) => ({
      id,
      terrain: 'ice',
      x: index,
      y: 0,
      neighbors: [list[index - 1], list[index + 1]].filter(neighbour => neighbour != null),
    })),
  };
  const zone = list => ({ visibility: [], cards: list });
  const stateOf = spirits => {
    const state = createState({
      map: lineMap,
      turn: { index: 1, playerId: '0', actionsLeft: 2 },
      _enteredHooks: { gameStart: true, turn: true },
      players: [
        {
          id: '0',
          name: 'Ифрит',
          order: 1,
          heroId: 'ifrit',
          deck: zone([]),
          hand: zone([]),
          discard: zone([]),
          skill: {
            id: 'ifrit_skill',
            rules: [
              {
                moment: 'turnStart',
                when: [
                  { fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 1 }, var: 'spirits' },
                ],
                then: [
                  {
                    action: 'SET_TARGETING',
                    op: 'open',
                    candidates: '$spirits',
                    count: 1,
                    required: false,
                  },
                ],
              },
              {
                moment: 'picked',
                when: [{ fact: 'PICKED', var: 'picked' }],
                then: [
                  { action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 },
                  { action: 'SET_ACTIONS', delta: 1 },
                ],
              },
            ],
          },
          fighters: [
            fighter({ id: 'ifrit', type: 'hero', currentPosition: 1, currentHp: 14 }),
            ...Array.from({ length: spirits }, (_, index) =>
              fighter({
                id: `ash${index}`,
                type: 'assistant',
                group: 'ash',
                currentPosition: 2 + index,
                currentHp: 1,
              }),
            ),
          ],
        },
        {
          id: '1',
          name: 'Соперник',
          order: 2,
          heroId: 'anubis',
          deck: zone([]),
          hand: zone([]),
          discard: zone([]),
          fighters: [fighter({ id: 'rival', type: 'hero', currentPosition: 5, currentHp: 14 })],
        },
      ],
    });
    const me = player(state, '0');
    state.targeting = {
      playerId: '0',
      source: 'ifrit_skill',
      kind: 'fighters',
      required: false,
      count: 1,
      picked: [],
      candidates: me.fighters
        .filter(fighter => fighter.type === 'assistant')
        .map(fighter => ({ fighterId: fighter.id })),
    };
    return state;
  };
  const clickWeight = (state, fighterId) =>
    actionsFor(state, '0', { policy: 'trade', skipAllowed: true }).find(
      option => option.action.kind === 'fighter' && option.action.id === fighterId,
    )?.weight ?? 0;

  it('последний дух стоит дороже, чем один из трёх', () => {
    const many = clickWeight(stateOf(3), 'ash0');
    const last = clickWeight(stateOf(1), 'ash0');

    expect(many).toBeGreaterThan(0);
    expect(last).toBeLessThan(many);
    // отказ от умения остаётся доступным: жертвовать не обязаны
    expect(clickWeight(stateOf(1), 'ash0')).toBeGreaterThan(0);
  });

  it('жертва одного из трёх не дешевле отказа, а жертва последнего — дешевле', () => {
    const many = stateOf(3);
    const last = stateOf(1);
    const skipOf = state =>
      actionsFor(state, '0', { policy: 'trade', skipAllowed: true }).find(
        option => option.action.type === 'UI_OK',
      )?.weight ?? 0;

    expect(clickWeight(many, 'ash0')).toBeGreaterThanOrEqual(skipOf(many));
    expect(clickWeight(last, 'ash0')).toBeLessThan(skipOf(last));
  });
});
