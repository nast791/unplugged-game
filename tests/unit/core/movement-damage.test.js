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

describe('проход с уроном: damageOnPass', () => {
  it('проход через двух врагов: каждый получает damageOnPass урона', () => {
    const state = blizzard(lineState());

    step(state, 5);

    expect(fighterOf(state, '0', 'queen').currentPosition).toBe(5);
    expect(hpOf(state, '1', 'rival')).toBe(13);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(4);
    // маршрут шага записан: по нему и нанесён урон
    expect(state.movement.moves).toEqual([
      { fighterId: 'queen', from: 1, to: 5, route: [2, 3, 4, 5] },
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
    const state = blizzard(lineState());
    step(state, 5);
    const first = { rival: hpOf(state, '1', 'rival'), pawn: hpOf(state, '1', 'rival_pawn') };

    // обратно сквозь тех же бойцов: один и тот же боец получает такой урон один раз за перемещение
    step(state, 1);

    expect(fighterOf(state, '0', 'queen').currentPosition).toBe(1);
    expect(hpOf(state, '1', 'rival')).toBe(first.rival);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(first.pawn);
    expect(state.movement.damagedFighterIds).toEqual(['rival', 'rival_pawn']);
  });

  it('свои бойцы урона не получают', () => {
    const state = blizzard(lineState());
    fighterOf(state, '0', 'raven').currentPosition = 2; // своя ворона стоит на маршруте

    step(state, 5);

    expect(hpOf(state, '0', 'raven')).toBe(2);
    expect(fighterOf(state, '0', 'raven').currentPosition).toBe(2);
    expect(hpOf(state, '1', 'rival')).toBe(13);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(4);
  });

  it('без damageOnPass урона нет и маршрут не пишется', () => {
    const state = blizzard(lineState(), { damageOnPass: null });

    step(state, 5);

    expect(state.movement.damageOnPass).toBe(null);
    expect(fighterOf(state, '0', 'queen').currentPosition).toBe(5);
    expect(hpOf(state, '1', 'rival')).toBe(15);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(6);
    expect(state.movement.moves).toEqual([{ fighterId: 'queen', from: 1, to: 5 }]);
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

    step(state, 5);

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

    step(state, 5);

    expect(hand(player(state, '0'))).toHaveLength(handBefore + 1);
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
    expect(ui.highlightedCellIds).toEqual(['2', '5']);
    expect(ui.controls.ok.label).toBe('Закончить эффект');
    expect(played.movement.source).toBe('snow-queen_11_0');
    expect(played.movement.playedCard.id).toBe('snow-queen_11');

    const moved = runAction(played, {
      type: 'PICK',
      kind: 'cell',
      id: 5,
      fighterId: 'queen',
      playerId: '0',
    });

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
  it('подсветка ведёт за врагов, а клик по клетке за ними наносит урон на проходе', () => {
    const state = blizzard(lineState());

    const ui = runUi(state, '0', { selectedFighterId: 'queen' });
    expect(ui.phase).toBe('movement');
    // клетки врагов не предлагаются (встать на них нельзя), а клетка за ними — да: проход идёт «сквозь»
    expect(ui.highlightedCellIds).toEqual(['2', '5']);
    expect(ui.highlightedFighterIds).toEqual(['queen']);

    const moved = runAction(state, {
      type: 'PICK',
      kind: 'cell',
      id: 5,
      fighterId: 'queen',
      playerId: '0',
    });

    expect(fighterOf(moved, '0', 'queen').currentPosition).toBe(5);
    expect(hpOf(moved, '1', 'rival')).toBe(13);
    expect(hpOf(moved, '1', 'rival_pawn')).toBe(4);
    // входное состояние не тронуто: ход считается на форке (`runAction`)
    expect(fighterOf(state, '0', 'queen').currentPosition).toBe(1);
    expect(hpOf(state, '1', 'rival')).toBe(15);
    expect(hpOf(state, '1', 'rival_pawn')).toBe(6);
    expect(state.movement.damagedFighterIds).toEqual([]);
    expect(state.movement.moves).toEqual([]);
    // шаги продолжают работать: подсветка считается от истока и учитывает уже пройденное
    expect(runUi(moved, '0', { selectedFighterId: 'queen' }).highlightedCellIds).toEqual([
      '1',
      '2',
    ]);
  });

  it('клик по занятой врагом клетке отклоняется, как и раньше', () => {
    const state = blizzard(lineState());

    expect(() =>
      runAction(state, { type: 'PICK', kind: 'cell', id: 3, fighterId: 'queen', playerId: '0' }),
    ).toThrow(/занята/);
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
