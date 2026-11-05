import { describe, expect, it } from 'vitest';
import { panelOrder } from '../../../app/composables/game/useGameHelpers.js';

/** Четыре места: id совпадает с порядком хода — так же, как в партии (`order` = место). */
const players = [1, 2, 3, 4].map(order => ({ id: String(order), order }));

const seats = (viewer, list = players) => panelOrder(list, viewer).map(player => player.order);

/** Снизу вверх: панель рисует массив сверху вниз, поэтому обратный порядок — это её низ. */
const fromBottom = (viewer, list = players) => seats(viewer, list).reverse();

describe('panelOrder', () => {
  it('снизу вверх — места по кругу от смотрящего: своя карточка внизу, дальше следующее место', () => {
    expect(fromBottom(1)).toEqual([1, 2, 3, 4]);
    expect(fromBottom(2)).toEqual([2, 3, 4, 1]);
    expect(fromBottom(3)).toEqual([3, 4, 1, 2]);
    expect(fromBottom(4)).toEqual([4, 1, 2, 3]);
  });

  it('сверху вниз массив идёт от последнего места к своей карточке', () => {
    expect(seats(1)).toEqual([4, 3, 2, 1]);
    expect(seats(2)).toEqual([1, 4, 3, 2]);
  });

  it('место смотрящего берётся по id, а порядок — по order', () => {
    const shuffled = [players[2], players[0], players[3], players[1]];
    expect(fromBottom('2', shuffled)).toEqual([2, 3, 4, 1]);
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
