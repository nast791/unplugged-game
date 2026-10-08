/**
 * Перестановка элементов — чистая часть сортировки (`app/composables/useSortable.js`): сам композабл
 * только ловит указатель и клавиши, а порядок считает эта функция. Так перестановку видно тестом
 * (`tests/unit/client/sortable.test.js`), без DOM и без компонента.
 *
 * Два способа поставить элемент на другое место:
 *
 * - `insert` — элемент встаёт **на** место `to`, соседи сдвигаются (обычный порядок списка: рука,
 *   очередь хода, лог);
 * - `swap` — два элемента меняются местами, остальные не двигаются (места за столом: герои просто
 *   меняются стульями, номера позиций остаются на своих местах).
 */
export const SORT_MODES = ['insert', 'swap'];

export const reorder = (list, from, to, mode = 'insert') => {
  const size = Array.isArray(list) ? list.length : 0;
  const next = Array.isArray(list) ? [...list] : [];
  // Индекс вне списка и перемещение «на себя» — не ошибка: указатель мог уйти за пределы цели,
  // а клавиша нажата на краю списка. Порядок в этом случае не меняется.
  if (from === to) return next;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return next;
  if (from < 0 || to < 0 || from >= size || to >= size) return next;

  if (mode === 'swap') {
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  }

  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export default reorder;
