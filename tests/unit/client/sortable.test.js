import { describe, expect, it } from 'vitest';
import { reorder } from '../../../app/utils/sortable.js';

const list = ['a', 'b', 'c', 'd'];

describe('reorder', () => {
  it('insert ставит элемент на указанную позицию, соседей сдвигает', () => {
    expect(reorder(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorder(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('swap меняет два элемента местами, остальных не двигает', () => {
    expect(reorder(list, 0, 2, 'swap')).toEqual(['c', 'b', 'a', 'd']);
    expect(reorder(list, 1, 3, 'swap')).toEqual(['a', 'd', 'c', 'b']);
  });

  it('на соседнем шаге insert и swap совпадают: стрелки ведут себя одинаково в обоих режимах', () => {
    expect(reorder(list, 2, 1)).toEqual(reorder(list, 2, 1, 'swap'));
    expect(reorder(list, 1, 2)).toEqual(reorder(list, 1, 2, 'swap'));
  });

  it('исходный список не меняется', () => {
    const copy = [...list];
    reorder(list, 0, 3);
    reorder(list, 0, 3, 'swap');
    expect(list).toEqual(copy);
  });

  it('перемещение на себя, край списка и нецелый индекс порядок не меняют', () => {
    expect(reorder(list, 2, 2)).toEqual(list);
    expect(reorder(list, -1, 2)).toEqual(list);
    expect(reorder(list, 0, 4)).toEqual(list);
    expect(reorder(list, 1.5, 2)).toEqual(list);
    expect(reorder(list, 0, -1, 'swap')).toEqual(list);
  });

  it('пустой список и не-массив дают пустой список', () => {
    expect(reorder([], 0, 1)).toEqual([]);
    expect(reorder(null, 0, 1)).toEqual([]);
  });
});
