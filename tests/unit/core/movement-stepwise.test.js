import { describe, expect, it } from 'vitest';
import { SET_MOVEMENT } from '#shared/actions/movement.js';
import { runUi } from '#shared/core.js';
import { movementDestinations, movementRejection } from '#shared/helpers/turn.js';
import movementPhase from '#shared/phases/movement.js';
import { createState, fighter } from '../../fixtures/state.js';

/**
 * Проход сквозь врагов — **пошаговое наступление** (m02680, требование владельца):
 * подсвечены только соседние клетки, после каждого шага подсветка пересчитывается, клетка врага —
 * тоже шаг (с уроном на проходе), но останавливаться на ней нельзя, а бюджет считает шаги, поэтому
 * «туда и обратно» разрешено.
 *
 * Сценарий владельца: наступил на соседнюю, потом на клетку врага, потом на клетку после врага,
 * потом опять на клетку врага и вернулся на исходную — каждый шаг по одной клетке.
 */
const lineMap = size => ({
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

const state = (patch = {}) => {
  const next = createState({
    map: lineMap(6),
    _enteredHooks: { gameStart: true, turn: true },
  });
  next.players[0].fighters = [
    fighter({ id: 'hero', type: 'hero', currentPosition: 1, currentHp: 16, startHp: 16 }),
  ];
  next.players[1].fighters = [
    fighter({ id: 'rival', type: 'hero', currentPosition: 3, currentHp: 15, startHp: 15 }),
  ];
  return SET_MOVEMENT(next, {
    op: 'open',
    playerId: '0',
    budget: 6,
    throughEnemies: true,
    damageOnPass: 1,
    healOnPass: 1,
    fighters: ['hero'],
    ...patch,
  });
};

const hero = current => current.players[0].fighters[0];
const rival = current => current.players[1].fighters[0];

const step = (current, cellId) =>
  SET_MOVEMENT(current, { op: 'step', playerId: '0', fighterId: 'hero', cellId });

describe('проход сквозь врагов: по одной клетке, подсветка пересчитывается', () => {
  it('подсветка показывает соседей и обновляется после каждого шага', () => {
    const start = state();

    expect(movementDestinations(start, '0', 'hero')).toEqual(['2']);
    const near = step(start, 2);
    // сосед 3 — клетка врага: шаг сквозь неё разрешён
    expect(movementDestinations(near, '0', 'hero')).toEqual(['1', '3']);

    const onto = step(near, 3);
    // стоим на клетке врага: подсветка считает уже от неё
    expect(movementDestinations(onto, '0', 'hero')).toEqual(['2', '4']);
  });

  it('сценарий владельца: туда-обратно по клеткам, урон и кража — один раз на врага', () => {
    let current = state();

    current = step(current, 2);
    expect(hero(current).currentPosition).toBe(2);

    current = step(current, 3); // клетка врага: урон и кража
    expect(hero(current).currentPosition).toBe(3);
    expect(rival(current).currentHp).toBe(14);
    expect(hero(current).currentHp).toBe(16); // выше старта лечение не поднимает

    current = step(current, 4); // за врага
    expect(hero(current).currentPosition).toBe(4);

    current = step(current, 3); // обратно на клетку врага: урона снова нет
    expect(hero(current).currentPosition).toBe(3);
    expect(rival(current).currentHp).toBe(14);

    current = step(current, 2);
    current = step(current, 1); // вернулись на исходную
    expect(hero(current).currentPosition).toBe(1);
    expect(current.movement.moves).toHaveLength(6);
    // бюджет 6 израсходован на шаги: дальше подсветки нет
    expect(movementDestinations(current, '0', 'hero')).toEqual([]);
  });

  it('на клетке врага нельзя остановиться: кнопка выключена, движок отклоняет', () => {
    const onto = step(step(state(), 2), 3);

    expect(hero(onto).currentPosition).toBe(3);
    expect(movementPhase.ok.enabled(onto, '0')).toBe(false);
    expect(() => SET_MOVEMENT(onto, { op: 'close', playerId: '0' })).toThrow(/занятой/);

    const away = step(onto, 4);
    expect(movementPhase.ok.enabled(away, '0')).toBe(true);
    expect(SET_MOVEMENT(away, { op: 'close', playerId: '0' }).movement).toBeNull();
  });

  it('клетку врага предлагают только с запасом шага на выход', () => {
    // бюджет 2: шаг на клетку врага оставляет ровно один шаг, чтобы сойти
    const short = state({ budget: 2 });
    expect(movementDestinations(short, '0', 'hero')).toEqual(['2']);

    const near = step(short, 2);
    expect(movementDestinations(near, '0', 'hero')).toEqual(['1']);
    expect(movementRejection(near, '0', 'hero', 3)).toMatch(/пройти насквозь/);

    // а с бюджетом 1 шага не остаётся вовсе
    const none = state({ budget: 1 });
    expect(movementDestinations(step(none, 2), '0', 'hero')).toEqual([]);
  });

  it('сквозь своего бойца тоже проходят, но здоровья не крадут и остановиться нельзя', () => {
    const current = state();
    current.players[0].fighters.push(
      fighter({ id: 'mate', type: 'assistant', currentPosition: 3, currentHp: 5, startHp: 5 }),
    );
    // врага уводим, чтобы на пути остался только свой
    current.players[1].fighters[0].currentPosition = 5;

    // шаг на клетку своего доступен, если остаётся шаг на выход
    expect(movementDestinations(current, '0', 'hero')).toEqual(['2']);
    const near = step(current, 2);
    expect(movementDestinations(near, '0', 'hero')).toEqual(['1', '3']);

    const onto = step(near, 3);
    expect(hero(onto).currentPosition).toBe(3);
    // своему бойцу ничего: урон и кража — только по бойцам противника
    expect(onto.players[0].fighters[1].currentHp).toBe(5);
    // и остановиться на его клетке нельзя
    expect(movementPhase.ok.enabled(onto, '0')).toBe(false);
    expect(movementDestinations(onto, '0', 'hero')).toEqual(['2', '4']);
  });

  it('клиент получает ровно то, что подсвечено: соседей, а не весь радиус', () => {
    const current = state();

    const ui = runUi(current, '0', { selectedFighterId: 'hero' });
    expect(ui.phase).toBe('movement');
    expect(ui.highlightedCellIds).toEqual(['2']);

    const near = step(current, 2);
    expect(runUi(near, '0', { selectedFighterId: 'hero' }).highlightedCellIds).toEqual(['1', '3']);
  });
});
