import { describe, expect, it } from 'vitest';
import { panelOrder } from '../../../app/utils/seatOrder.js';

/** Четыре места: id совпадает с порядком хода — так же, как в партии (`order` = место). */
const players = [1, 2, 3, 4].map(order => ({ id: String(order), order }));

const seats = (viewer, list = players) => panelOrder(list, viewer).map(player => player.order);

describe('panelOrder', () => {
  it('своя карточка — последняя, соперники идут по кругу мест', () => {
    expect(seats(4)).toEqual([1, 2, 3, 4]);
    expect(seats(2)).toEqual([3, 4, 1, 2]);
    expect(seats(1)).toEqual([2, 3, 4, 1]);
    expect(seats(3)).toEqual([4, 1, 2, 3]);
  });

  it('над своей карточкой снизу вверх — соперники в обратном порядке хода', () => {
    // За 4-м местом снизу вверх: 3, 2, 1 — то есть 3-й (кто ходит передо мной) прямо над моей карточкой,
    // а наверху тот, чей ход был раньше всех.
    expect(seats(4).slice(0, -1).reverse()).toEqual([3, 2, 1]);
  });

  it('место смотрящего берётся по id, а порядок — по order', () => {
    const shuffled = [players[2], players[0], players[3], players[1]];
    expect(panelOrder(shuffled, '2').map(player => player.order)).toEqual([3, 4, 1, 2]);
  });

  it('незнакомое место смотрящего и короткий список не ломают порядок', () => {
    expect(seats(9)).toEqual([1, 2, 3, 4]);
    expect(seats(null)).toEqual([1, 2, 3, 4]);
    expect(seats(2, [players[1]])).toEqual([2]);
    expect(seats(2, [])).toEqual([]);
  });

  it('не трогает исходный список', () => {
    const source = [...players];
    panelOrder(source, 2);
    expect(source.map(player => player.order)).toEqual([1, 2, 3, 4]);
  });
});
