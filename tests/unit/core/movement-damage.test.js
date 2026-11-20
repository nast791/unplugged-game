import { describe, expect, it } from 'vitest';
import { SET_MOVEMENT } from '#shared/actions/movement.js';
import { runUi } from '#shared/core.js';
import { movementDestinations } from '#shared/helpers/turn.js';
import movementPhase from '#shared/phases/movement.js';
import { runAction } from '#shared/publicApi.js';
import { card, createState, deck, discard, fighter, hand, player } from '../../fixtures/state.js';

/**
 * «Метель из осколков»: боец идёт сквозь бойцов противника, и каждый, через кого он прошёл, получает
 * `damageOnPass` урона. Шаг в игре — «откуда → куда», поэтому маршрут достраивается по клеткам радиуса
 * (кратчайшим путём), а урон идёт обычным SET_HEALTH: герой теряет здоровье, помощник гибнет на нуле
 * и срабатывает момент `lost` его владельца. Свои не страдают, повторный вход в ту же клетку не
 * удваивает урон, а без `damageOnPass` поведение перемещения прежнее.
 */
const LINE = 8;

/** Поле-линия 1—2—3…: на нём маршрут шага однозначен (обойти бойца нельзя). */
const lineMap = (size = LINE) => ({
  id: 'line',
  name: 'Line',
  nodes: Array.from({ length: size }, (_, index) => {
    const id = index + 1;
    return {
      id,
      x: index,
      y: 0,
      terrain: 'ice',
      neighbors: [id - 1, id + 1].filter(neighbor => neighbor >= 1 && neighbor <= size),
    };
  }),
});

/**
 * Королева и её ворона против героя и помощника: свои на 1 и 8, враги на 3 и 4.
 * `_enteredHooks` — ход уже идёт: без этого lifecycle на первом же действии закрыл бы момент.
 */
const lineState = () => {
  const state = createState({
    map: lineMap(),
    _enteredHooks: { gameStart: true, turn: true },
  });
  state.players[0].fighters = [
    fighter({
      id: 'queen',
      name: 'Королева',
      type: 'hero',
      currentPosition: 1,
      currentHp: 16,
      startHp: 16,
    }),
    fighter({
      id: 'raven',
      name: 'Ворона',
      type: 'assistant',
      currentPosition: 8,
      currentHp: 2,
      startHp: 2,
      move: 3,
    }),
  ];
  state.players[1].fighters = [
    fighter({
      id: 'rival',
      name: 'Соперник',
      type: 'hero',
      currentPosition: 3,
      currentHp: 15,
      startHp: 15,
    }),
    fighter({
      id: 'rival_pawn',
      name: 'Помощник',
      type: 'assistant',
      currentPosition: 4,
      currentHp: 6,
      startHp: 6,
    }),
  ];
  return state;
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => String(entry.id) === fighterId);

const hpOf = (state, playerId, fighterId) => fighterOf(state, playerId, fighterId)?.currentHp ?? 0;

/** «Метель из осколков» как её открывает карта: королева, до 4 клеток, сквозь врагов, 2 урона пройденным. */
const blizzard = (state, patch = {}) =>
  SET_MOVEMENT(state, {
    op: 'open',
    playerId: '0',
    budget: 4,
    throughEnemies: true,
    damageOnPass: 2,
    fighters: ['queen'],
    ...patch,
  });

const step = (state, cellId) =>
  SET_MOVEMENT(state, { op: 'step', playerId: '0', fighterId: 'queen', cellId });

/** Проход сквозь врагов идёт **по одной клетке**: каждый клик — соседняя клетка (m02680). */
const walk = (state, cells) => {
  for (const cellId of cells) step(state, cellId);
  return state;
};

describe('проход с уроном: damageOnPass', () => {
  it('проход через двух врагов: каждый получает damageOnPass урона', () => {
    const state = blizzard(lineState());

    walk(state, [2, 3, 4, 5]);

    expect(fighterOf(state, '0', 'queen').currentPosition).toBe(5);
    expect(hpOf(state, '1', 'rival')).toBe(13);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(4);
    // шагов четыре, и у каждого свой маршрут: проход считается по клеткам, а не «прыжком» до цели
    expect(state.movement.moves.map(move => [move.from, move.to])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
  });

  it('урон только на входе в клетку: старт движения и клетка рядом с врагом ничего не стоят', () => {
    const state = blizzard(lineState());

    // королева встаёт рядом с врагом (клетка 2): она никого не прошла
    step(state, 2);

    expect(hpOf(state, '1', 'rival')).toBe(15);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(6);
  });

  it('повторный вход в ту же клетку урон не удваивает', () => {
    // бюджета хватает на дорогу туда и обратно: шаги считаются, а не расстояние от истока
    const state = blizzard(lineState(), { budget: 8 });
    walk(state, [2, 3, 4, 5]);
    const first = { rival: hpOf(state, '1', 'rival'), pawn: hpOf(state, '1', 'rival_pawn') };

    // обратно сквозь тех же бойцов: один и тот же боец получает такой урон один раз за перемещение
    walk(state, [4, 3, 2, 1]);

    expect(fighterOf(state, '0', 'queen').currentPosition).toBe(1);
    expect(hpOf(state, '1', 'rival')).toBe(first.rival);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(first.pawn);
    expect(state.movement.damagedFighterIds).toEqual(['rival', 'rival_pawn']);
  });

  it('свои бойцы урона не получают', () => {
    const state = blizzard(lineState());
    fighterOf(state, '0', 'raven').currentPosition = 6; // своя ворона стоит за врагами

    walk(state, [2, 3, 4, 5]);

    expect(hpOf(state, '0', 'raven')).toBe(2);
    expect(fighterOf(state, '0', 'raven').currentPosition).toBe(6);
    expect(hpOf(state, '1', 'rival')).toBe(13);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(4);
  });

  it('без damageOnPass урона нет и маршрут не пишется', () => {
    const state = blizzard(lineState(), { damageOnPass: null });

    walk(state, [2, 3, 4, 5]);

    expect(state.movement.damageOnPass).toBe(null);
    expect(fighterOf(state, '0', 'queen').currentPosition).toBe(5);
    expect(hpOf(state, '1', 'rival')).toBe(15);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(6);
    // маршрут пишется только у шага, который что-то делает: здесь он ничего не делает
    expect(state.movement.moves.map(move => move.route)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('без throughEnemies проход сквозь врагов закрыт: клетка за ними вне радиуса', () => {
    const state = blizzard(lineState(), { throughEnemies: false });

    expect(() =>
      runAction(state, { type: 'PICK', kind: 'cell', id: 5, fighterId: 'queen', playerId: '0' }),
    ).toThrow(/вне радиуса/);
    expect(hpOf(state, '1', 'rival')).toBe(15);
  });

  it('помощник противника гибнет на нуле: срабатывает момент lost его владельца', () => {
    const state = blizzard(lineState());
    // правило владельца погибшего помощника: верхняя карта колоды уходит в сброс
    player(state, '1').skill = {
      id: 'test_lost',
      rules: [
        {
          moment: 'lost',
          when: [{ fact: 'DEATH', params: { type: 'assistant' } }],
          then: [{ action: 'SET_CARDS', op: 'discard', from: 'deck', count: 1 }],
        },
      ],
    };
    fighterOf(state, '1', 'rival_pawn').currentHp = 1;
    const deckBefore = deck(player(state, '1')).length;

    walk(state, [2, 3, 4, 5]);

    expect(player(state, '1').fighters.map(entry => entry.id)).toEqual(['rival']);
    expect(player(state, '1').lost.map(entry => entry.id)).toEqual(['rival_pawn']);
    expect(deck(player(state, '1'))).toHaveLength(deckBefore - 1);
    expect(discard(player(state, '1')).map(entry => entry.id)).toEqual(['deck_c']);
    expect(hpOf(state, '1', 'rival')).toBe(13);
  });

  it('смертельный урон объявляет источник: срабатывает и правило lost самой карты', () => {
    const state = blizzard(lineState(), {
      source: 'snow-queen_11_0',
      playedCard: {
        id: 'snow-queen_11',
        rules: [
          {
            moment: 'lost',
            when: [{ fact: 'DEATH', params: { source: 'snow-queen_11', type: 'assistant' } }],
            then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
          },
        ],
      },
    });
    fighterOf(state, '1', 'rival_pawn').currentHp = 1;
    const handBefore = hand(player(state, '0')).length;

    walk(state, [2, 3, 4, 5]);

    expect(hand(player(state, '0'))).toHaveLength(handBefore + 1);
  });
});

/**
 * «Пепельный ветер» Ифрита — то же перемещение, но идущий не только бьёт, а **крадёт здоровье**:
 * `healOnPass` возвращает ему столько же за каждого пройденного бойца противника. Лечение идёт тем же
 * `SET_HEALTH`, поэтому выше начального здоровья не поднимает, а маршрут считается и без урона:
 * свойство живёт и одним лечением.
 */
const steal = (state, patch = {}) =>
  SET_MOVEMENT(state, {
    op: 'open',
    playerId: '0',
    budget: 4,
    throughEnemies: true,
    healOnPass: 1,
    fighters: ['queen'],
    ...patch,
  });

/** Королева ранена: лечение видно, а предел здоровья (16) не мешает. */
const wound = state => {
  fighterOf(state, '0', 'queen').currentHp = 10;
  return state;
};

describe('проход с кражей здоровья: healOnPass', () => {
  it('идущий получает 1 здоровья за каждого пройденного врага', () => {
    const state = wound(steal(lineState(), { damageOnPass: 1 }));

    walk(state, [2, 3, 4, 5]);

    expect(fighterOf(state, '0', 'queen').currentPosition).toBe(5);
    expect(hpOf(state, '0', 'queen')).toBe(12);
    // враги при этом теряют по 1: «крадёт», а не «лечится»
    expect(hpOf(state, '1', 'rival')).toBe(14);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(5);
  });

  it('встав рядом с врагом, здоровья не крадёшь: считается только пройденное', () => {
    const state = wound(steal(lineState(), { damageOnPass: 1 }));

    step(state, 2);

    expect(fighterOf(state, '0', 'queen').currentPosition).toBe(2);
    expect(hpOf(state, '0', 'queen')).toBe(10);
    expect(hpOf(state, '1', 'rival')).toBe(15);
  });

  it('без урона кража работает: damageOnPass для маршрута не нужен', () => {
    const state = wound(steal(lineState()));

    walk(state, [2, 3, 4, 5]);

    expect(hpOf(state, '0', 'queen')).toBe(12);
    expect(hpOf(state, '1', 'rival')).toBe(15);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(6);
    // маршрут пишется у каждого шага, который прошёл по клетке врага
    expect(state.movement.moves[1].route).toEqual(['2', '3']);
    expect(state.movement.moves[2].route).toEqual(['3', '4']);
  });

  it('лечение не поднимает здоровье выше начального', () => {
    const state = steal(lineState(), { damageOnPass: 1 }); // королева цела: 16 из 16

    walk(state, [2, 3, 4, 5]);

    expect(hpOf(state, '0', 'queen')).toBe(16);
  });

  it('повторный проход через тех же врагов здоровья не добавляет', () => {
    const state = wound(steal(lineState(), { damageOnPass: 1, budget: 8 }));

    walk(state, [2, 3, 4, 5]);
    const stolen = hpOf(state, '0', 'queen');
    walk(state, [4, 3, 2, 1]);

    expect(hpOf(state, '0', 'queen')).toBe(stolen);
  });
});

describe('карта «Метель из осколков»: эффект открывает перемещение с уроном', () => {
  it('эффект-карта ведёт королеву сквозь врагов: окно эффекта, урон, конец эффекта', () => {
    const state = lineState();
    player(state, '0').hand.cards.push(
      card({
        id: 'snow-queen_11',
        title: 'Метель из осколков',
        type: 'effect',
        value: 0,
        bonus: 2,
        fighter: 'queen',
        rules: [
          {
            moment: 'effect',
            then: [
              {
                action: 'SET_MOVEMENT',
                op: 'open',
                budget: 4,
                fighters: ['queen'],
                throughEnemies: true,
                damageOnPass: 2,
              },
            ],
          },
        ],
      }),
    );

    const played = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'snow-queen_11_0',
      playerId: '0',
    });

    // перемещение открыто эффектом: подсветка, кнопка эффекта, источник — сама карта
    const ui = runUi(played, '0', { selectedFighterId: 'queen' });
    expect(ui.phase).toBe('movement');
    // пошаговое наступление: подсвечена только соседняя клетка, дальние — после шага
    expect(ui.highlightedCellIds).toEqual(['2']);
    expect(ui.controls.ok.label).toBe('Закончить эффект');
    expect(played.movement.source).toBe('snow-queen_11_0');
    expect(played.movement.playedCard.id).toBe('snow-queen_11');

    let moved = played;
    for (const cellId of [2, 3, 4, 5]) {
      moved = runAction(moved, {
        type: 'PICK',
        kind: 'cell',
        id: cellId,
        fighterId: 'queen',
        playerId: '0',
      });
    }

    expect(fighterOf(moved, '0', 'queen').currentPosition).toBe(5);
    expect(hpOf(moved, '1', 'rival')).toBe(13);
    expect(hpOf(moved, '1', 'rival_pawn')).toBe(4);

    // «Закончить эффект» закрывает и перемещение, и очередь шагов карты
    const finished = runAction(moved, { type: 'UI_OK', playerId: '0' });
    expect(finished.movement).toBeNull();
    expect(finished.effect).toBeNull();
    expect(hpOf(finished, '1', 'rival')).toBe(13);
  });
});

describe('клиентское окно движения: подсветка и шаги', () => {
  it('подсветка пересчитывается после каждого шага: соседние клетки, включая клетку врага', () => {
    const state = blizzard(lineState());

    const ui = runUi(state, '0', { selectedFighterId: 'queen' });
    expect(ui.phase).toBe('movement');
    // шаг — одна клетка: подсвечен только сосед
    expect(ui.highlightedCellIds).toEqual(['2']);
    expect(ui.highlightedFighterIds).toEqual(['queen']);

    const near = runAction(state, {
      type: 'PICK',
      kind: 'cell',
      id: 2,
      fighterId: 'queen',
      playerId: '0',
    });

    // входное состояние не тронуто: ход считается на форке (`runAction`)
    expect(fighterOf(state, '0', 'queen').currentPosition).toBe(1);
    expect(state.movement.moves).toEqual([]);
    expect(fighterOf(near, '0', 'queen').currentPosition).toBe(2);
    // соседи новой клетки: назад и вперёд, причём клетка врага 3 подсвечена — на неё можно шагнуть
    expect(runUi(near, '0', { selectedFighterId: 'queen' }).highlightedCellIds).toEqual(['1', '3']);

    const onto = runAction(near, {
      type: 'PICK',
      kind: 'cell',
      id: 3,
      fighterId: 'queen',
      playerId: '0',
    });

    // боец стоит на клетке врага — это промежуточный шаг прохода, а не место для остановки
    expect(fighterOf(onto, '0', 'queen').currentPosition).toBe(3);
    expect(hpOf(onto, '1', 'rival')).toBe(13);
    expect(hpOf(onto, '1', 'rival_pawn')).toBe(6);
  });

  it('на клетке врага нельзя закончить перемещение: кнопка выключена, движок отклоняет', () => {
    const state = blizzard(lineState());
    state.hook = 'movement';
    const near = SET_MOVEMENT(state, { op: 'step', playerId: '0', fighterId: 'queen', cellId: 2 });
    const onto = SET_MOVEMENT(near, { op: 'step', playerId: '0', fighterId: 'queen', cellId: 3 });

    expect(fighterOf(onto, '0', 'queen').currentPosition).toBe(3);
    expect(movementPhase.ok.enabled(onto, '0')).toBe(false);
    expect(() => SET_MOVEMENT(onto, { op: 'close', playerId: '0' })).toThrow(/занятой/);

    // шаг с чужой клетки на свободную — снова можно закрывать
    const away = SET_MOVEMENT(onto, { op: 'step', playerId: '0', fighterId: 'queen', cellId: 2 });
    expect(fighterOf(away, '0', 'queen').currentPosition).toBe(2);
    expect(movementPhase.ok.enabled(away, '0')).toBe(true);
    expect(SET_MOVEMENT(away, { op: 'close', playerId: '0' }).movement).toBeNull();
  });

  it('бюджет считает шаги, а не расстояние: можно вернуться на исходную клетку', () => {
    const state = blizzard(lineState());
    walk(state, [2, 3, 2, 1]);

    expect(fighterOf(state, '0', 'queen').currentPosition).toBe(1);
    expect(state.movement.moves).toHaveLength(4);
    // бюджет 4 исчерпан: дальше шагов нет
    expect(movementDestinations(state, '0', 'queen')).toEqual([]);
  });
});

describe('пустое перемещение не открывается', () => {
  /**
   * Королева заперта по-настоящему: поле из двух клеток, соседняя занята врагом, а прохода сквозь
   * врагов это перемещение не разрешает (`throughEnemies: false`). Для «Метели из осколков» такой
   * расклад был тупиком: окно обязательное, шагов нет, отказаться нельзя — партия вставала намертво.
   * Решение владельца: нет свободных клеток — свойство просто не срабатывает.
   */
  const lockedQueen = () => {
    const state = createState({
      map: lineMap(2),
      _enteredHooks: { gameStart: true, turn: true },
    });
    state.players[0].fighters = [
      fighter({
        id: 'queen',
        name: 'Королева',
        type: 'hero',
        currentPosition: 1,
        currentHp: 16,
        startHp: 16,
      }),
    ];
    state.players[1].fighters = [
      fighter({
        id: 'rival',
        name: 'Соперник',
        type: 'hero',
        currentPosition: 2,
        currentHp: 15,
        startHp: 15,
      }),
    ];
    return state;
  };

  it('запертая королева: окно эффекта не открывается, ходов нет', () => {
    const state = lockedQueen();

    const opened = blizzard(state, {
      source: 'snow-queen_11_0',
      playerId: '0',
      throughEnemies: false,
    });

    expect(opened.movement).toBeFalsy();
  });

  it('незапертая королева: окно эффекта открывается как раньше', () => {
    const state = blizzard(lineState(), { source: 'snow-queen_11_0' });

    expect(state.movement?.source).toBe('snow-queen_11_0');
    expect(state.movement.budget).toBe(4);
  });

  it('уже открытое окно без ходов закрывается кнопкой «Закончить эффект»', () => {
    // окно открыто, но шагать некуда и шаги больше не появятся (радиус исчерпан) — окно обязано
    // закрываться, иначе получится тот же тупик, только на шаг позже
    const state = lockedQueen();
    state.movement = {
      playerId: '0',
      origins: {},
      bonus: 0,
      bonusUsed: false,
      budget: 0,
      fighters: ['queen'],
      optional: false,
      throughEnemies: false,
      damageOnPass: 2,
      damagedFighterIds: [],
      moves: [],
      source: 'snow-queen_11_0',
      playedCard: null,
    };

    expect(movementDestinations(state, '0', 'queen')).toEqual([]);
    expect(movementPhase.ok.enabled(state, '0')).toBe(true);
  });
});
