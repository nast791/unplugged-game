import { describe, expect, it } from 'vitest';
import { runAction, runUi } from '#shared/publicApi.js';
import { actionsFor } from '../../../bot/play/duel.js';
import {
  attackWeight,
  cardCostWeight,
  defenseWeight,
  drawWeight,
  holdWeight,
  movementWeight,
  optionWeight,
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

  it('условия карты меняют выбор: «Погребальный звон» в покое сильнее карты на 5', () => {
    const state = attackReady();
    const anubis = player(state, '0');
    anubis.heroId = 'anubis';
    anubis.fighters.find(fighter => fighter.id === 'alpha').id = 'anubis';
    anubis.hand.cards = [
      { ...cardById('anubis_01'), instanceId: 'bell_0' },
      fixtureCard({ id: 'plain_05', type: 'attack', value: 5, bonus: 1, fighter: 'anubis' }),
    ];

    // по напечатанному числу карта на 5 сильнее (4 против 5) — так выбирает `greedy`
    const greedy = actionsFor(state, '0', { policy: 'greedy' });
    expect(weightOf(greedy, isCard('plain_05_0'))).toBeGreaterThan(
      weightOf(greedy, isCard('bell_0')),
    );

    // политика `conditions` читает правило карты: пока Анубис не двигался, звон — это 6
    const conditions = actionsFor(state, '0', { policy: 'conditions' });
    expect(weightOf(conditions, isCard('bell_0'))).toBeGreaterThan(
      weightOf(conditions, isCard('plain_05_0')),
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

    // «Погребальный звон» — та же карта (4), но при покое её число 6: весит больше
    expect(attackWeight({ value: 4 }, conditions, { ...deck, strength: 6 })).toBeGreaterThan(
      attackWeight({ value: 4 }, conditions, deck),
    );
    // у `greedy` ген нулевой: эффективное число политика не оплачивает
    expect(attackWeight({ value: 4 }, greedy, { ...deck, strength: 6 })).toBe(
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
