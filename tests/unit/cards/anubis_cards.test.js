import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runLifecycle, runUi } from '#shared/publicApi.js';
import anubisCards from '../../../server/content/heroes/anubis/cards.js';
import { createState, discard, fighter, hand, PHASES, player } from '../../fixtures/state.js';

const card = id => anubisCards.find(entry => entry.id === id);

/** Линия 1—2—3—4: 1—2 пустыня, 3—4 лёд. Анубис на 2, Бета на 3. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'desert' },
    { id: 2, neighbors: [1, 3], terrain: 'desert' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3], terrain: 'ice' },
  ],
};

const iceMap = {
  id: 'ice',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3], terrain: 'ice' },
  ],
};

const zone = cards => ({ visibility: [], cards });

const unit = (id, cell, hp, extra = {}) => ({
  ...fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 2,
    attackRange: 1,
  }),
  startHp: hp,
  ...extra,
});

const slot = (id, name, order, fighters, hand = [], extra = {}) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone(extra.deck ?? []),
  hand: zone(hand),
  discard: zone(extra.discard ?? []),
  fighters,
  ...(extra.items ? { items: extra.items } : {}),
  ...(extra.skill ? { skill: extra.skill } : {}),
});

const shroud = state => ({
  id: 'shroud',
  group: 'shroud',
  name: 'Пелена',
  type: 'item',
  count: 1,
  state,
});

const betaDefense = (id = 'bdef', value = 3, extra = {}) => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type: 'defense',
  value,
  bonus: 1,
  fighter: 'beta',
  ...extra,
});

const betaAttack = (id = 'batk', value = 6, bonus = 2) => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type: 'attack',
  value,
  bonus,
  fighter: 'beta',
});

/** Анубис (игрок 0) с картой в руке, Бета (игрок 1) с рукой `foeHand`; `map` задаёт стихии. */
const buildState = ({
  map = lineMap,
  anubisCell = 2,
  foeCell = 3,
  moved = false,
  cardInHand = 'anubis_01',
  anubisHandExtra = [],
  foeHand = [],
  foeHp = 13,
  shroudState = 'inactive',
  withAmat = true,
  amatCell = 2,
  discardCards = [],
  skill = null,
} = {}) => {
  const anubisFighters = [unit('anubis', anubisCell, 16, { attackRange: 2, movedThisTurn: moved })];
  if (withAmat) {
    anubisFighters.push(unit('amat', amatCell, 8, { type: 'assistant', group: 'amat' }));
  }

  return createState({
    phase: PHASES.turn,
    map,
    players: [
      slot(
        '0',
        'Анубис',
        1,
        anubisFighters,
        [{ ...card(cardInHand), instanceId: `${cardInHand}_1` }, ...anubisHandExtra],
        { items: [shroud(shroudState)], discard: discardCards, skill },
      ),
      slot('1', 'Бета', 2, [unit('beta', foeCell, foeHp)], foeHand),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });
};

const attackWith = (state, cardId, attackerId = '0') =>
  runAction(state, { type: 'PICK', kind: 'card', id: cardId, playerId: attackerId });

const passDefense = (state, defenderId = '1') =>
  runAction(state, { type: 'UI_OK', playerId: defenderId });

const defendWith = (state, cardId, defenderId = '1') =>
  runAction(state, { type: 'PICK', kind: 'card', id: cardId, playerId: defenderId });

const finishMove = (state, playerId = '0') => runAction(state, { type: 'UI_OK', playerId });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

const hpOf = (state, playerId, fighterId) => fighterOf(state, playerId, fighterId)?.currentHp ?? 0;

const ids = (list, key = 'id') => list.map(entry => entry[key]);

describe('карты Анубиса: атаки', () => {
  it('раскладка пула — по паспорту: 14 уникальных, 30 копий, моменты из списка', () => {
    expect(anubisCards).toHaveLength(14);
    expect(anubisCards.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(30);
    for (const entry of anubisCards) {
      if (entry.hook != null) throw new Error(`карта ${entry.id} описывает хук`);
      for (const rule of entry.rules) expect(isMoment(rule.moment)).toBe(true);
    }

    // паспорт §7: атаки 5/11, защиты 1/3, гибриды 4/9, эффекты 4/7 — «Амат разрывает» атака, не гибрид
    const pool = anubisCards.reduce((acc, entry) => {
      const row = (acc[entry.type] ??= { unique: 0, copies: 0 });
      row.unique += 1;
      row.copies += entry.quantity;
      return acc;
    }, {});
    expect(pool).toEqual({
      attack: { unique: 5, copies: 11 },
      defense: { unique: 1, copies: 3 },
      hybrid: { unique: 4, copies: 9 },
      effect: { unique: 4, copies: 7 },
    });
  });

  it('«Погребальный звон»: стоящий бьёт на 5, двигавшийся — на 3', () => {
    const standing = passDefense(attackWith(buildState(), 'anubis_01_1'));
    expect(standing.lastCombat.attackValue).toBe(5);
    expect(hpOf(standing, '1', 'beta')).toBe(8);

    const moved = passDefense(attackWith(buildState({ moved: true }), 'anubis_01_1'));
    expect(moved.lastCombat.attackValue).toBe(3);
    expect(hpOf(moved, '1', 'beta')).toBe(10);
  });

  it('«Песчаная буря»: враг на песке получает 2 урона до чисел боя', () => {
    // Бета стоит на 3 (лёд) — свойства нет: 5 картой
    const dry = passDefense(attackWith(buildState({ cardInHand: 'anubis_02' }), 'anubis_02_1'));
    expect(dry.lastCombat.combatDamage).toBe(5);
    expect(hpOf(dry, '1', 'beta')).toBe(8);

    // Бета на 1 (пустыня) — 2 урона свойством и 5 боем
    const sandy = passDefense(
      attackWith(buildState({ cardInHand: 'anubis_02', foeCell: 1 }), 'anubis_02_1'),
    );
    expect(hpOf(sandy, '1', 'beta')).toBe(6);
  });

  it('«Печать Маат»: полная рука врага стоит ему случайной карты', () => {
    const foeHand = [
      betaDefense('bd1', 2),
      betaDefense('bd2', 2),
      betaDefense('bd3', 2),
      betaDefense('bd4', 2),
    ];
    const after = passDefense(
      attackWith(buildState({ cardInHand: 'anubis_03', foeHand }), 'anubis_03_1'),
    );

    expect(ids(hand(player(after, '1')))).toHaveLength(3);
  });

  it('«Печать Маат»: в руке меньше четырёх — сброса нет', () => {
    const foeHand = [betaDefense('bd1', 2), betaDefense('bd2', 2), betaDefense('bd3', 2)];
    const after = passDefense(
      attackWith(buildState({ cardInHand: 'anubis_03', foeHand }), 'anubis_03_1'),
    );

    expect(ids(hand(player(after, '1')))).toHaveLength(3);
  });
});

describe('карты Анубиса: Амат', () => {
  const amatState = (extra = {}) =>
    buildState({ cardInHand: 'anubis_13', anubisCell: 2, amatCell: 2, foeCell: 1, ...extra });

  it('«Амат ждёт»: победа Амат съедает карту врага', () => {
    const foeHand = [betaDefense('bd1', 2), betaDefense('bd2', 2)];
    const after = passDefense(attackWith(amatState({ foeHand }), 'anubis_13_1'));

    expect(after.lastCombat.winner).toBe('attacker');
    expect(ids(hand(player(after, '1')))).toHaveLength(1);
  });

  it('«Амат разрывает»: защитник меняет выложенную карту на другую', () => {
    const foeHand = [betaDefense('bdef', 3), betaDefense('bdef2', 2)];
    const opened = attackWith(
      buildState({ cardInHand: 'anubis_14', foeCell: 1, foeHand }),
      'anubis_14_1',
    );
    const defended = defendWith(opened, 'bdef_1');

    // замена: старая защита в сбросе, бой снова ждёт защиту и пасовать нельзя
    expect(defended.combat).toMatchObject({ stage: 'defense', defenseRequired: true });
    expect(ids(discard(player(defended, '1')))).toEqual(['bdef']);
    expect(ids(hand(player(defended, '1')))).toEqual(['bdef2']);
    expect(runUi(defended, '1').controls.ok.enabled).toBe(false);

    const replaced = defendWith(defended, 'bdef2_1');
    expect(replaced.combat ?? null).toBeNull();
    expect(replaced.lastCombat.defenseValue).toBe(2);
    expect(ids(discard(player(replaced, '1')))).toEqual(['bdef', 'bdef2']);
  });

  it('«Амат разрывает»: меняться нечем — защита сброшена, урон полный', () => {
    const foeHand = [betaDefense('bdef', 3)];
    const opened = attackWith(
      buildState({ cardInHand: 'anubis_14', foeCell: 1, foeHand }),
      'anubis_14_1',
    );
    const defended = defendWith(opened, 'bdef_1');

    expect(defended.combat ?? null).toBeNull();
    expect(defended.lastCombat.defenseValue).toBe(0);
    expect(defended.lastCombat.combatDamage).toBe(5);
    expect(hpOf(defended, '1', 'beta')).toBe(8);
    expect(ids(discard(player(defended, '1')))).toEqual(['bdef']);
  });

  it('«Амат разрывает» — только атака: в защиту карта не годится', () => {
    const state = buildState({
      cardInHand: 'anubis_14',
      anubisCell: 1,
      amatCell: 2,
      foeCell: 3,
      foeHand: [betaAttack('batk', 6, 2)],
    });
    // атакует Бета, цель — Амат: привязка карты совпадает с атакованным бойцом
    state.turn = { ...state.turn, playerId: '1', actedRound: ['1'] };

    // тип — атака: в окне защиты подсветить нечего, свойство про защищающегося не объявить собой
    expect(card('anubis_14').type).toBe('attack');
    expect(runUi(attackWith(state, 'batk_1', '1'), '0').playableCardIds).toEqual([]);
  });
});

describe('карты Анубиса: Саван', () => {
  const defendState = ({ attackBonus = 2, attackValue = 6 } = {}) => {
    const state = buildState({
      map: iceMap,
      anubisCell: 2,
      foeCell: 3,
      cardInHand: 'anubis_04',
      foeHand: [betaAttack('batk', attackValue, attackBonus)],
      // Амат уводим: иначе у Беты две цели и бой встаёт на выбор цели
      withAmat: false,
    });
    // атакует Бета (её ход), Анубис защищается Саваном — как в тестах защиты Ифрита
    state.turn = { ...state.turn, playerId: '1', actedRound: ['1'] };
    return state;
  };

  /** Бета атакует, Анубис защищается Саваном. */
  const battle = state => {
    const opened = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'batk_1',
      playerId: '1',
    });
    return runAction(opened, { type: 'PICK', kind: 'card', id: 'anubis_04_1', playerId: '0' });
  };

  it('значение Савана равно усилению атаки противника', () => {
    const after = battle(defendState({ attackBonus: 2, attackValue: 6 }));

    expect(after.lastCombat.defenseValue).toBe(2);
    expect(after.lastCombat.combatDamage).toBe(4);
    expect(hpOf(after, '0', 'anubis')).toBe(12);
  });

  it('карта без усиления не защищает: Саван остаётся нулём', () => {
    const after = battle(defendState({ attackBonus: 0, attackValue: 6 }));

    expect(after.lastCombat.defenseValue).toBe(0);
    expect(after.lastCombat.combatDamage).toBe(6);
  });
});

describe('карты Анубиса: позиция и контроль', () => {
  it('«Врата»: победа переносит врага на свободный песок без прохода', () => {
    const after = passDefense(attackWith(buildState({ cardInHand: 'anubis_05' }), 'anubis_05_1'));

    expect(after.lastCombat.winner).toBe('attacker');
    // свободный песок на линии один (клетка 1), поэтому движок отмечает его сам
    expect(after.targeting ?? null).toBeNull();
    expect(String(fighterOf(after, '1', 'beta').currentPosition)).toBe('1');
    // постановка, а не шаг: движения «в этом ходу» у чужого бойца не появляется
    expect(fighterOf(after, '1', 'beta').movedThisTurn ?? false).toBe(false);
    expect(ids(discard(player(after, '0')))).toEqual(['anubis_05']);
  });

  it('«Врата»: свободного песка несколько — окно необязательное, от переноса можно отказаться', () => {
    // песок 1 и 4 свободны (Анубис и Амат стоят на 2, Бета — на льду 3)
    const map = {
      nodes: [
        { id: 1, neighbors: [2], terrain: 'desert' },
        { id: 2, neighbors: [1, 3], terrain: 'desert' },
        { id: 3, neighbors: [2, 4], terrain: 'ice' },
        { id: 4, neighbors: [3], terrain: 'desert' },
      ],
    };
    const after = passDefense(
      attackWith(buildState({ cardInHand: 'anubis_05', map }), 'anubis_05_1'),
    );

    // «можете поместить»: текст карты разрешает не помещать — окно закрывается общей кнопкой
    expect(after.targeting).toMatchObject({ kind: 'cells', required: false });
    expect(after.targeting.candidates.map(entry => String(entry.cellId)).sort()).toEqual([
      '1',
      '4',
    ]);
    expect(runUi(after, '0').controls.ok).toMatchObject({ visible: true, enabled: true });

    const declined = runAction(after, { type: 'UI_OK', playerId: '0' });
    expect(declined.targeting ?? null).toBeNull();
    expect(String(fighterOf(declined, '1', 'beta').currentPosition)).toBe('3');
  });

  it('«Врата»: песка на карте нет — свойства нет', () => {
    const after = passDefense(
      attackWith(
        buildState({ cardInHand: 'anubis_05', map: iceMap, foeCell: 3, withAmat: false }),
        'anubis_05_1',
      ),
    );

    expect(after.targeting ?? null).toBeNull();
    expect(String(fighterOf(after, '1', 'beta').currentPosition)).toBe('3');
  });

  it('«Немой приговор»: пустая рука врага бьёт его героя на 4', () => {
    const after = passDefense(attackWith(buildState({ cardInHand: 'anubis_06' }), 'anubis_06_1'));

    // 3 картой + 4 приговором
    expect(hpOf(after, '1', 'beta')).toBe(6);
  });

  it('«Немой приговор»: одна карта в руке — приговор всё равно срабатывает', () => {
    const after = passDefense(
      attackWith(
        buildState({ cardInHand: 'anubis_06', foeHand: [betaDefense('bd1', 2)] }),
        'anubis_06_1',
      ),
    );

    // 3 картой + 4 приговором: «1 карта или меньше» считается до сброса сыгранной карты
    expect(hpOf(after, '1', 'beta')).toBe(6);
  });

  it('«Немой приговор»: две карты в руке — удара нет', () => {
    const after = passDefense(
      attackWith(
        buildState({
          cardInHand: 'anubis_06',
          foeHand: [betaDefense('bd1', 2), betaDefense('bd2', 2)],
        }),
        'anubis_06_1',
      ),
    );

    expect(hpOf(after, '1', 'beta')).toBe(10);
  });

  it('«Тайна бальзамирования»: карта эффекта из сброса возвращается в руку', () => {
    const state = buildState({
      cardInHand: 'anubis_07',
      withAmat: false,
      discardCards: [
        {
          id: 'anubis_09',
          instanceId: 'anubis_09_1',
          title: 'Суд молчит',
          type: 'effect',
          bonus: 2,
        },
        betaDefense('bd1', 2),
      ],
    });

    const opened = passDefense(attackWith(state, 'anubis_07_1'));

    // в сбросе только карта эффекта — кандидат один, но выбор настоящий: окно ждёт подтверждения
    expect(opened.targeting).toMatchObject({ kind: 'options', required: false });
    expect(opened.targeting.candidates.map(entry => entry.optionId)).toEqual(['anubis_09_1']);

    const picked = runAction(opened, {
      type: 'PICK',
      kind: 'option',
      id: 'anubis_09_1',
      playerId: '0',
    });
    const after = runAction(picked, { type: 'UI_OK', playerId: '0' });

    // вернулась та же копия: `id` карты и ключ копии (`instanceId`) — разные вещи
    expect(ids(hand(player(after, '0')), 'instanceId')).toEqual(['anubis_09_1']);
    expect(ids(discard(player(after, '0')), 'instanceId').sort()).toEqual(['anubis_07_1', 'bd1_1']);
  });

  it('«Тайна бальзамирования»: карт эффекта в сбросе нет — свойства нет', () => {
    const state = buildState({
      cardInHand: 'anubis_07',
      withAmat: false,
      discardCards: [betaDefense('bd1', 2)],
    });

    const after = passDefense(attackWith(state, 'anubis_07_1'));

    expect(after.targeting ?? null).toBeNull();
    expect(ids(hand(player(after, '0')))).toEqual([]);
  });

  it('«Канопа»: пустая колода не раскрывается и не падает', () => {
    const state = buildState({
      cardInHand: 'anubis_08',
      anubisCell: 2,
      amatCell: 2,
      foeCell: 1,
      anubisHandExtra: [],
    });
    player(state, '0').deck = zone([]);

    const after = passDefense(attackWith(state, 'anubis_08_1'));

    expect(after.reveal ?? null).toBeNull();
    expect(after.movement ?? null).toBeNull();
  });

  it('«Канопа»: раскрытая колода двигает Анубиса и уходит под низ', () => {
    const state = buildState({
      cardInHand: 'anubis_08',
      anubisCell: 2,
      amatCell: 2,
      foeCell: 1,
      anubisHandExtra: [],
    });
    player(state, '0').deck = zone([
      { id: 'deck_low', title: 'Low', type: 'effect', value: 0, bonus: 1 },
      { id: 'deck_top', title: 'Top', type: 'effect', value: 0, bonus: 2 },
    ]);

    const after = passDefense(attackWith(state, 'anubis_08_1'));

    // раскрытие ещё открыто: под низ карта уходит после движения
    expect(after.reveal?.[0]?.cards).toHaveLength(1);
    expect(after.movement).toMatchObject({ playerId: '0', budget: 2, fighters: ['anubis'] });
    expect(ids(player(after, '0').deck.cards)).toEqual(['deck_low', 'deck_top']);

    // движение «Канопы» заканчивается: «затем положите раскрытую карту под низ» — один раз,
    // повторного правила, которое убирало бы то, чего в раскрытии уже нет, у карты нет
    const closed = finishMove(after);

    expect(closed.combat ?? null).toBeNull();
    expect(closed.reveal ?? null).toBeNull();
    // карта ушла под низ: низ — начало массива
    expect(ids(player(closed, '0').deck.cards)).toEqual(['deck_top', 'deck_low']);
  });
});

describe('карты Анубиса: эффекты', () => {
  const playEffect = (state, cardId, playerId = '0') =>
    runAction(state, { type: 'PICK', kind: 'card', id: `${cardId}_1`, playerId });

  it('«Суд молчит»: тихий ход даёт карту и выбор из двух верхних', () => {
    const state = buildState({ cardInHand: 'anubis_09' });
    player(state, '0').deck = zone([
      { id: 'deck_low', title: 'Low', bonus: 1 },
      { id: 'deck_mid', title: 'Mid', bonus: 1 },
      { id: 'deck_top', title: 'Top', bonus: 1 },
    ]);
    const hero = fighterOf(state, '0', 'anubis');
    hero.currentHp = 12;

    const opened = playEffect(state, 'anubis_09');

    // добор уже прошёл: верхняя карта в руке; окно показывает две оставшиеся верхние
    expect(ids(hand(player(opened, '0')))).toEqual(['deck_top']);
    expect(opened.targeting).toMatchObject({ kind: 'options', count: 1, required: true });
    expect(opened.targeting.candidates.map(entry => entry.optionId).sort()).toEqual([
      'deck_low',
      'deck_mid',
    ]);

    const picked = runAction(opened, {
      type: 'PICK',
      kind: 'option',
      id: 'deck_mid',
      playerId: '0',
    });
    const after = runAction(picked, { type: 'UI_OK', playerId: '0' });

    // выбранная взята, вторая (deck_low) ушла под низ — осталась одна и та же карта
    expect(ids(hand(player(after, '0')))).toEqual(['deck_top', 'deck_mid']);
    expect(ids(player(after, '0').deck.cards)).toEqual(['deck_low']);
  });

  it('«Суд молчит»: двигавшийся герой берёт карту без выбора', () => {
    const state = buildState({ cardInHand: 'anubis_09', moved: true });
    const hero = fighterOf(state, '0', 'anubis');
    hero.currentHp = 12;
    player(state, '0').deck = zone([
      { id: 'deck_low', title: 'Low', bonus: 1 },
      { id: 'deck_top', title: 'Top', bonus: 1 },
    ]);

    const after = playEffect(state, 'anubis_09');

    // выбор — только за тихий ход; шаг его отменяет, добор остаётся
    expect(after.targeting ?? null).toBeNull();
    expect(ids(hand(player(after, '0')))).toEqual(['deck_top']);
    expect(hpOf(after, '0', 'anubis')).toBe(12);
  });

  it('«Плач по Амат»: убитая Амат даёт две карты', () => {
    const state = buildState({ cardInHand: 'anubis_10', withAmat: false });
    player(state, '0').lost = [unit('amat', null, 0, { type: 'assistant', group: 'amat' })];
    player(state, '0').deck = zone([
      { id: 'deck_a', title: 'A', bonus: 1 },
      { id: 'deck_b', title: 'B', bonus: 1 },
    ]);

    const after = playEffect(state, 'anubis_10');

    // добор берёт с верха колоды: верх — конец массива
    expect(ids(hand(player(after, '0')))).toEqual(['deck_b', 'deck_a']);
    // пелена поднимается до начала своего следующего хода
    expect(player(after, '0').items[0]).toMatchObject({
      state: 'active',
      temporary: { until: 'turnStart', restore: 'inactive' },
    });
  });

  it('«Плач по Амат»: пока Амат жива, эффектом карта не предлагается — только топливом', () => {
    const state = buildState({ cardInHand: 'anubis_10', withAmat: true });
    const ui = runUi(state, '0');

    // состояние не сошлось: действие карта не открывает, но сбросить её ради усиления можно
    expect(ui.playableCardIds).toEqual([]);
    expect(ui.disabledCardIds).toEqual(['anubis_10_1']);
    expect(card('anubis_10').bonus).toBe(1);
  });

  it('«Зал суда»: сожжение улик без весов, карта остаётся в сбросе навсегда', () => {
    expect(card('anubis_11')).toMatchObject({
      type: 'effect',
      value: null,
      bonus: 3,
      quantity: 1,
      fighter: 'anubis',
      noReturn: true,
    });
    // весы — сравнение усилений в битве; у эффекта оппонент картой не отвечает
    expect(card('anubis_11').tags ?? []).toEqual([]);
    expect(card('anubis_11').text).not.toContain('Помилование');
    expect(card('anubis_11').text).toContain('не может быть возвращена');
    expect(card('anubis_11').rules.map(rule => rule.moment)).toEqual(['effect', 'effect']);
    for (const rule of card('anubis_11').rules) expect(isMoment(rule.moment)).toBe(true);
    // урон равен числу эффектов в сбросе: факт `CARDS` отдаёт число, `SET_HEALTH` — урон
    expect(card('anubis_11').rules[0].then[0]).toMatchObject({
      action: 'SET_HEALTH',
      fighterIds: '$hero',
      damage: '$n',
    });
    expect(
      card('anubis_11').rules[0].when.some(
        condition => condition.fact === 'CARDS' && condition.params.count === true,
      ),
    ).toBe(true);
  });

  it('«Зал суда»: урон в лицо равен числу карт эффектов в сбросе', () => {
    const state = buildState({
      cardInHand: 'anubis_11',
      withAmat: true,
      shroudState: 'active',
      discardCards: [
        {
          id: 'anubis_09',
          instanceId: 'anubis_09_1',
          title: 'Суд молчит',
          type: 'effect',
          bonus: 2,
        },
      ],
    });

    const after = playEffect(state, 'anubis_11');

    // в сбросе лежал один эффект, сыгранная карта тоже эффект — 2 урона герою
    expect(hpOf(after, '1', 'beta')).toBe(11);
    expect(ids(discard(player(after, '0')))).toContain('anubis_11');
  });

  it('«Зал суда»: двигавшийся Анубис улики не сжигает', () => {
    const state = buildState({
      cardInHand: 'anubis_11',
      withAmat: true,
      shroudState: 'active',
      moved: true,
      discardCards: [
        {
          id: 'anubis_09',
          instanceId: 'anubis_09_1',
          title: 'Суд молчит',
          type: 'effect',
          bonus: 2,
        },
      ],
    });

    const after = playEffect(state, 'anubis_11');

    expect(hpOf(after, '1', 'beta')).toBe(13);
  });

  it('«Зал суда»: сожжённую карту не вернуть «Тайной бальзамирования»', () => {
    const state = buildState({
      cardInHand: 'anubis_07',
      withAmat: false,
      discardCards: [
        {
          id: 'anubis_11',
          instanceId: 'anubis_11_1',
          title: 'Зал суда',
          type: 'effect',
          bonus: 3,
          noReturn: true,
        },
      ],
    });

    // возвращать нечего: единственная карта эффекта помечена `noReturn`, окна нет
    const after = passDefense(attackWith(state, 'anubis_07_1'));

    expect(after.targeting ?? null).toBeNull();
  });

  /** Линия 1—2—3—4: песок на 1, 2 и 4, лёд на 3 — свободного песка на карте два. */
  const sandMap = {
    id: 'sand',
    nodes: [
      { id: 1, neighbors: [2], terrain: 'desert' },
      { id: 2, neighbors: [1, 3], terrain: 'desert' },
      { id: 3, neighbors: [2, 4], terrain: 'ice' },
      { id: 4, neighbors: [3], terrain: 'desert' },
    ],
  };

  const pickCell = (state, cellId, playerId = '0') =>
    runAction(state, { type: 'PICK', kind: 'cell', id: cellId, playerId });

  const placeFighter = (state, fighterId, cellId, playerId = '0') =>
    runAction(state, { type: 'PICK', kind: 'cell', id: cellId, fighterId, playerId });

  it('«Путь на закат»: описана правилами, перенос — без прохода', () => {
    expect(card('anubis_12').rules.map(rule => rule.moment)).toEqual(['effect', 'picked']);
    for (const rule of card('anubis_12').rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card('anubis_12')).toMatchObject({
      type: 'effect',
      value: null,
      bonus: 1,
      quantity: 2,
      fighter: 'anubis',
    });
    expect(card('anubis_12').rules[0].when[1]).toMatchObject({
      fact: 'CELLS',
      params: { terrain: 'desert', free: true },
      var: 'cells',
    });
    // постановку без прохода помечает `teleport`: иначе перенос считался бы движением
    expect(card('anubis_12').rules[1].then[0]).toMatchObject({
      action: 'SET_FIGHTER_CELL',
      fighterId: 'anubis',
      teleport: true,
    });
  });

  it('«Путь на закат»: окно со свободными клетками пустыни', () => {
    const state = buildState({ map: sandMap, cardInHand: 'anubis_12', anubisCell: 2, foeCell: 3 });

    const after = playEffect(state, 'anubis_12');

    expect(after.targeting).toMatchObject({ playerId: '0', kind: 'cells', required: true });
    // Анубис стоит на песке 2, Бета — на льду 3: свободны 1 и 4
    expect(after.targeting.candidates.map(entry => entry.cellId).sort()).toEqual(['1', '4']);
    expect(runUi(after, '0').highlightedCellIds.sort()).toEqual(['1', '4']);
    // окно требует выбора: без клика перенос не случается
    expect(String(fighterOf(after, '0', 'anubis').currentPosition)).toBe('2');
  });

  it('«Путь на закат»: перенос на выбранный песок не считается движением', () => {
    const state = buildState({ map: sandMap, cardInHand: 'anubis_12', anubisCell: 2, foeCell: 3 });

    const moved = pickCell(playEffect(state, 'anubis_12'), '4');
    const anubis = fighterOf(moved, '0', 'anubis');

    expect(String(anubis.currentPosition)).toBe('4');
    // перенос — не шаг: покой хода цел, «Суд молчит» и «Погребальный звон» ещё работают
    expect(anubis.movedThisTurn).toBeFalsy();
    expect(moved.movement ?? null).toBeNull();
    expect(moved.targeting ?? null).toBeNull();
  });

  it('«Путь на закат»: единственный свободный песок движок отмечает сам', () => {
    // Амат не выставлена: на линии 1—2—3—4 свободен ровно один песок — 2
    const state = buildState({
      cardInHand: 'anubis_12',
      anubisCell: 1,
      foeCell: 4,
      withAmat: false,
    });

    const after = playEffect(state, 'anubis_12');

    expect(after.targeting ?? null).toBeNull();
    expect(String(fighterOf(after, '0', 'anubis').currentPosition)).toBe('2');
  });

  it('«Путь на закат»: на не-песок так не попасть', () => {
    const state = buildState({ map: sandMap, cardInHand: 'anubis_12', anubisCell: 2, foeCell: 3 });
    const played = playEffect(state, 'anubis_12');

    expect(() => pickCell(played, '3')).toThrow(/не среди кандидатов/);
  });

  it('«Путь на закат»: без свободного песка эффектом не предлагается — только топливом', () => {
    // на ледяной карте пустыни нет вовсе
    const state = buildState({ map: iceMap, cardInHand: 'anubis_12' });
    const ui = runUi(state, '0');

    expect(ui.playableCardIds).toEqual([]);
    expect(ui.disabledCardIds).toEqual(['anubis_12_1']);
    expect(card('anubis_12').bonus).toBe(1);
  });

  it('«Путь на закат»: замороженному перенос закрыт — карта не предлагается', () => {
    const state = buildState({
      cardInHand: 'anubis_12',
      anubisCell: 1,
      foeCell: 4,
      withAmat: false,
    });
    fighterOf(state, '0', 'anubis').frozen = true;

    const ui = runUi(state, '0');

    expect(ui.playableCardIds).toEqual([]);
    expect(ui.disabledCardIds).toEqual(['anubis_12_1']);
  });
});

describe('карты Анубиса: удар в ходу снимает суд', () => {
  it('удар картой ставит бойцу «наносил урон в этом ходу»', () => {
    const after = passDefense(attackWith(buildState(), 'anubis_01_1'));

    expect(fighterOf(after, '0', 'anubis').dealtDamageThisTurn).toBe(true);
  });

  it('начало следующего хода флаг снимает: в новом ходу суд снова работает', () => {
    const struck = passDefense(attackWith(buildState({ foeHp: 21 }), 'anubis_01_1'));
    // ход Анубиса передан дальше и вернулся к нему: флаг живёт ровно один ход
    const next = runLifecycle({ ...struck, hook: PHASES.turnStart });

    expect(fighterOf(next, '0', 'anubis').dealtDamageThisTurn).toBe(false);
  });
});

describe('карты Анубиса: весы при целой пелене', () => {
  /** Бета атакует Анубиса (её ход), Анубис отвечает картой защиты. */
  const defendBattle = (state, cardId, attackId = 'batk_1') => {
    state.turn = { ...state.turn, playerId: '1', actedRound: ['1'] };
    const opened = runAction(state, { type: 'PICK', kind: 'card', id: attackId, playerId: '1' });
    return runAction(opened, { type: 'PICK', kind: 'card', id: cardId, playerId: '0' });
  };

  it('«Печать Маат»: усиление врага не больше нашего — помилование берёт карту', () => {
    const state = buildState({
      cardInHand: 'anubis_03',
      shroudState: 'active',
      foeHand: [betaDefense('bdef', 3, { bonus: 1 })],
    });
    player(state, '0').deck = zone([{ id: 'deck_low', title: 'Low', bonus: 1 }]);

    const after = defendWith(attackWith(state, 'anubis_03_1'), 'bdef_1');

    expect(ids(hand(player(after, '0')))).toEqual(['deck_low']);
    expect(hand(player(after, '1'))).toHaveLength(0);
  });

  it('«Печать Маат»: усиление врага строго больше — наказание сбрасывает ещё одну', () => {
    const state = buildState({
      cardInHand: 'anubis_03',
      shroudState: 'active',
      foeHand: [betaDefense('bdef', 3, { bonus: 3 }), betaDefense('spare', 2, { bonus: 1 })],
    });

    const after = defendWith(attackWith(state, 'anubis_03_1'), 'bdef_1');

    // защита уже ушла в сброс боя, вторая карта — сброс суда
    expect(ids(hand(player(after, '1')))).toEqual([]);
    expect(ids(discard(player(after, '1'))).sort()).toEqual(['bdef', 'spare']);
  });

  it('«Печать Маат»: пелена не активна — суда нет, карта не берётся', () => {
    const state = buildState({
      cardInHand: 'anubis_03',
      shroudState: 'inactive',
      foeHand: [betaDefense('bdef', 3, { bonus: 3 }), betaDefense('spare', 2, { bonus: 1 })],
    });
    player(state, '0').deck = zone([{ id: 'deck_low', title: 'Low', bonus: 1 }]);

    const after = defendWith(attackWith(state, 'anubis_03_1'), 'bdef_1');

    expect(ids(hand(player(after, '0')))).toEqual([]);
    expect(ids(hand(player(after, '1')))).toEqual(['spare']);
  });

  it('«Саван»: яростная атака — наказание укрепляет копию на +3', () => {
    const state = buildState({
      map: iceMap,
      anubisCell: 2,
      foeCell: 3,
      cardInHand: 'anubis_04',
      shroudState: 'active',
      withAmat: false,
      foeHand: [betaAttack('batk', 6, 3)],
    });

    const after = defendBattle(state, 'anubis_04_1');

    // зеркало 3 плюс 3 за грех нападающего — удар гасится целиком
    expect(after.lastCombat.defenseValue).toBe(6);
    expect(after.lastCombat.combatDamage).toBe(0);
  });

  it('«Саван»: лёгкая атака — помилование лечит Анубиса после битвы', () => {
    const state = buildState({
      map: iceMap,
      anubisCell: 2,
      foeCell: 3,
      cardInHand: 'anubis_04',
      shroudState: 'active',
      withAmat: false,
      foeHand: [betaAttack('batk', 6, 1)],
    });
    fighterOf(state, '0', 'anubis').currentHp = 10;

    const after = defendBattle(state, 'anubis_04_1');

    // 6 − 1 = 5 урона, затем 2 здоровья обратно
    expect(after.lastCombat.defenseValue).toBe(1);
    expect(hpOf(after, '0', 'anubis')).toBe(7);
  });

  it('«Врата»: тяжёлая атака — свойства чужой карты не действуют, числа остаются', () => {
    const state = buildState({
      map: iceMap,
      anubisCell: 2,
      foeCell: 3,
      cardInHand: 'anubis_05',
      shroudState: 'active',
      withAmat: false,
      foeHand: [betaAttack('batk', 6, 3)],
    });

    const after = defendBattle(state, 'anubis_05_1');

    // отменяются тексты, а не значение: атака 6 против защиты 3
    expect(after.lastCombat.attackValue).toBe(6);
    expect(after.lastCombat.combatDamage).toBe(3);
    // Анубис получил 3 урона боем: 16 − 3
    expect(hpOf(after, '0', 'anubis')).toBe(13);
  });

  it('«Врата»: лёгкая атака — помилование обнуляет карту оппонента', () => {
    const state = buildState({
      map: iceMap,
      anubisCell: 2,
      foeCell: 3,
      cardInHand: 'anubis_05',
      shroudState: 'active',
      withAmat: false,
      foeHand: [betaAttack('batk', 6, 1)],
    });

    const after = defendBattle(state, 'anubis_05_1');

    expect(after.lastCombat.attackValue).toBe(0);
    expect(after.lastCombat.winner).toBe('defender');
    expect(after.lastCombat.combatDamage).toBe(0);
  });

  it('«Немой приговор»: наказание бьёт бойца оппонента на 2', () => {
    const state = buildState({
      cardInHand: 'anubis_06',
      shroudState: 'active',
      foeHand: [betaDefense('bdef', 1, { bonus: 3 }), betaDefense('spare', 1)],
    });

    const after = defendWith(attackWith(state, 'anubis_06_1'), 'bdef_1');

    // 2 урона картой + 4 приговором (в руке осталась 1 карта) + 2 судом = 8
    expect(hpOf(after, '1', 'beta')).toBe(5);
  });

  it('«Немой приговор»: помилование двигает Анубиса или Амат', () => {
    const state = buildState({
      cardInHand: 'anubis_06',
      shroudState: 'active',
      foeHand: [betaDefense('bdef', 1, { bonus: 1 }), betaDefense('spare', 1)],
    });

    const after = defendWith(attackWith(state, 'anubis_06_1'), 'bdef_1');

    expect(after.movement).toMatchObject({
      playerId: '0',
      fighters: ['anubis', 'amat'],
      budget: 2,
      optional: true,
      teleport: true,
    });
  });

  it('«Немой приговор»: помилование щитом — в защиту урон боя меньше на 1', () => {
    const state = buildState({
      map: iceMap,
      anubisCell: 2,
      foeCell: 3,
      cardInHand: 'anubis_06',
      shroudState: 'active',
      withAmat: false,
      foeHand: [betaAttack('batk', 6, 1)],
    });

    const after = defendBattle(state, 'anubis_06_1');

    // печатная 3 плюс 1 от суда: 6 − 4 = 2 урона вместо 3
    expect(after.lastCombat.defenseValue).toBe(4);
    expect(after.lastCombat.combatDamage).toBe(2);
  });

  it('«Немой приговор»: щит — только в защиту, в атаку значение прежнее', () => {
    const state = buildState({
      cardInHand: 'anubis_06',
      shroudState: 'active',
      foeHand: [betaDefense('bdef', 1, { bonus: 1 })],
    });

    const after = defendWith(attackWith(state, 'anubis_06_1'), 'bdef_1');

    expect(after.lastCombat.attackValue).toBe(3);
  });

  it('«Амат ждёт»: помилование лечит выбранного — Амат или Анубиса', () => {
    const pardoned = buildState({
      cardInHand: 'anubis_13',
      amatCell: 2,
      shroudState: 'active',
      foeHand: [betaDefense('bdef', 2, { bonus: 2 }), betaDefense('spare', 1)],
    });
    fighterOf(pardoned, '0', 'amat').currentHp = 5;
    const waiting = defendWith(attackWith(pardoned, 'anubis_13_1'), 'bdef_1');

    // из двоих выбирает игрок: окно обязательное, кандидаты — Анубис и Амат
    expect(waiting.targeting).toMatchObject({ kind: 'fighters', count: 1, required: true });
    expect(waiting.targeting.candidates.map(entry => entry.fighterId).sort()).toEqual([
      'amat',
      'anubis',
    ]);

    const healed = runAction(waiting, {
      type: 'PICK',
      kind: 'fighter',
      id: 'amat',
      playerId: '0',
    });
    expect(hpOf(healed, '0', 'amat')).toBe(7);

    const hero = buildState({
      cardInHand: 'anubis_13',
      amatCell: 4,
      shroudState: 'active',
      foeHand: [betaDefense('bdef', 2, { bonus: 2 }), betaDefense('spare', 1)],
    });
    fighterOf(hero, '0', 'anubis').currentHp = 10;
    const heroWindow = defendWith(attackWith(hero, 'anubis_13_1'), 'bdef_1');
    const heroHealed = runAction(heroWindow, {
      type: 'PICK',
      kind: 'fighter',
      id: 'anubis',
      playerId: '0',
    });
    expect(hpOf(heroHealed, '0', 'anubis')).toBe(12);

    const punished = buildState({
      cardInHand: 'anubis_13',
      amatCell: 2,
      shroudState: 'active',
      foeHand: [betaDefense('bdef', 2, { bonus: 4 }), betaDefense('spare', 1)],
    });
    const after = defendWith(attackWith(punished, 'anubis_13_1'), 'bdef_1');
    // 4 − 2 = 2 урона картой и 3 судом
    expect(after.lastCombat.combatDamage).toBe(2);
    expect(hpOf(after, '1', 'beta')).toBe(8);
  });
});
