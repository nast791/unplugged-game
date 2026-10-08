import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
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
  discard: zone([]),
  fighters,
  ...(extra.items ? { items: extra.items } : {}),
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
} = {}) => {
  const anubisFighters = [unit('anubis', anubisCell, 15, { attackRange: 2, movedThisTurn: moved })];
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
        { items: [shroud(shroudState)] },
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

    // паспорт §7: атаки 5/10, защиты 1/3, гибриды 4/8, эффекты 4/9 — «Амат разрывает» атака, не гибрид
    const pool = anubisCards.reduce((acc, entry) => {
      const row = (acc[entry.type] ??= { unique: 0, copies: 0 });
      row.unique += 1;
      row.copies += entry.quantity;
      return acc;
    }, {});
    expect(pool).toEqual({
      attack: { unique: 5, copies: 10 },
      defense: { unique: 1, copies: 3 },
      hybrid: { unique: 4, copies: 8 },
      effect: { unique: 4, copies: 9 },
    });
  });

  it('«Погребальный звон»: стоящий бьёт на 6, двигавшийся — на 4', () => {
    const standing = passDefense(attackWith(buildState(), 'anubis_01_1'));
    expect(standing.lastCombat.attackValue).toBe(6);
    expect(hpOf(standing, '1', 'beta')).toBe(7);

    const moved = passDefense(attackWith(buildState({ moved: true }), 'anubis_01_1'));
    expect(moved.lastCombat.attackValue).toBe(4);
    expect(hpOf(moved, '1', 'beta')).toBe(9);
  });

  it('«Песчаная буря»: враг на песке получает 1 урон до чисел боя', () => {
    // Бета стоит на 3 (лёд) — свойства нет
    const dry = passDefense(attackWith(buildState({ cardInHand: 'anubis_02' }), 'anubis_02_1'));
    expect(dry.lastCombat.combatDamage).toBe(3 - 0);
    expect(hpOf(dry, '1', 'beta')).toBe(10);

    // Бета на 1 (пустыня) — 1 урон свойством и 3 боем
    const sandy = passDefense(
      attackWith(buildState({ cardInHand: 'anubis_02', foeCell: 1 }), 'anubis_02_1'),
    );
    expect(hpOf(sandy, '1', 'beta')).toBe(9);
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
    expect(defended.lastCombat.combatDamage).toBe(3);
    expect(hpOf(defended, '1', 'beta')).toBe(10);
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
    expect(hpOf(after, '0', 'anubis')).toBe(11);
  });

  it('карта без усиления не защищает: Саван остаётся нулём', () => {
    const after = battle(defendState({ attackBonus: 0, attackValue: 6 }));

    expect(after.lastCombat.defenseValue).toBe(0);
    expect(after.lastCombat.combatDamage).toBe(6);
  });
});

describe('карты Анубиса: позиция и контроль', () => {
  it('«Врата»: после победы можно сдвинуть врага на 1 клетку', () => {
    const after = passDefense(attackWith(buildState({ cardInHand: 'anubis_05' }), 'anubis_05_1'));

    expect(after.lastCombat.winner).toBe('attacker');
    expect(after.movement).toMatchObject({ playerId: '0', budget: 1, fighters: ['beta'] });

    const moved = runAction(after, {
      type: 'PICK',
      kind: 'cell',
      id: '4',
      fighterId: 'beta',
      playerId: '0',
    });
    expect(String(fighterOf(moved, '1', 'beta').currentPosition)).toBe('4');

    const closed = finishMove(moved);
    expect(closed.combat ?? null).toBeNull();
    expect(ids(discard(player(closed, '0')))).toEqual(['anubis_05']);
  });

  it('«Немой приговор»: пустая рука врага возвращает карту', () => {
    const state = buildState({ cardInHand: 'anubis_06' });
    player(state, '0').deck = zone([{ id: 'deck_low', title: 'Low', bonus: 1 }]);
    const before = hand(player(state, '0')).length;

    const after = passDefense(attackWith(state, 'anubis_06_1'));

    // сыгранная карта ушла в бой, за пустую руку врага взяли одну
    expect(hand(player(after, '0'))).toHaveLength(before);
  });

  it('«Песчаный саван»: на песке карта 4, вне песка — 3', () => {
    const sandy = passDefense(
      attackWith(buildState({ cardInHand: 'anubis_07', withAmat: false }), 'anubis_07_1'),
    );
    expect(sandy.lastCombat.attackValue).toBe(4);

    const dry = passDefense(
      attackWith(
        buildState({ cardInHand: 'anubis_07', map: iceMap, foeCell: 3, withAmat: false }),
        'anubis_07_1',
      ),
    );
    expect(dry.lastCombat.attackValue).toBe(3);
  });

  it('«Канопа»: победа вскрывает колоду, Амат идёт на усиление, карта — под низ', () => {
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

    // раскрытие ещё открыто: под низ карта уходит после движения Амат
    expect(after.reveal?.[0]?.cards).toHaveLength(1);
    expect(after.movement).toMatchObject({ playerId: '0', budget: 2, fighters: ['amat'] });
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

  it('«Суд молчит»: тихий ход даёт карту и здоровье', () => {
    const state = buildState({ cardInHand: 'anubis_09' });
    player(state, '0').deck = zone([{ id: 'deck_low', title: 'Low', bonus: 1 }]);
    const hero = fighterOf(state, '0', 'anubis');
    hero.currentHp = 12;

    const after = playEffect(state, 'anubis_09');

    expect(hpOf(after, '0', 'anubis')).toBe(13);
    expect(ids(hand(player(after, '0')))).toEqual(['deck_low']);
  });

  it('«Суд молчит»: двигавшийся герой ничего не получает', () => {
    const state = buildState({ cardInHand: 'anubis_09', moved: true });
    const hero = fighterOf(state, '0', 'anubis');
    hero.currentHp = 12;
    player(state, '0').deck = zone([{ id: 'deck_low', title: 'Low', bonus: 1 }]);

    const after = playEffect(state, 'anubis_09');

    expect(hpOf(after, '0', 'anubis')).toBe(12);
    expect(hand(player(after, '0'))).toHaveLength(0);
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
  });

  it('«Погребальная пелена»: кладёт предмет в состояние «цела»', () => {
    const state = buildState({ cardInHand: 'anubis_11', shroudState: 'inactive' });

    const after = playEffect(state, 'anubis_11');

    expect(player(after, '0').items[0].state).toBe('active');
  });

  it('«Путь на закат»: Анубис проходит до 2 клеток', () => {
    const state = buildState({ cardInHand: 'anubis_12', anubisCell: 1, foeCell: 4, amatCell: 3 });

    const after = playEffect(state, 'anubis_12');

    expect(after.movement).toMatchObject({ playerId: '0', budget: 2, fighters: ['anubis'] });

    const moved = runAction(after, {
      type: 'PICK',
      kind: 'cell',
      id: '2',
      fighterId: 'anubis',
      playerId: '0',
    });
    expect(String(fighterOf(moved, '0', 'anubis').currentPosition)).toBe('2');
  });
});
