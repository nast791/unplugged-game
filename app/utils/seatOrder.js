/**
 * Порядок карточек мест в левой панели партии.
 *
 * Игрок видит **свою** карточку в самом низу, а соперники уходят от неё вверх по кругу следования мест:
 * следующий после меня, потом через одного, … и последний — тот, кто ходит передо мной. Так внизу панели
 * оказывается сосед по очереди, а наверху — тот, чей ход был только что.
 *
 * Пример на четырёх местах: за 4-м — вверх 3, 2, 1; за 2-м — 1, 4, 3.
 */

/** Место игрока: `order` из состояния (1 — первый ход), иначе его id как есть. */
const seatOf = player => Number(player?.order) || String(player?.id ?? '');

/**
 * Карточки по кругу мест: своя — последняя в списке (низ панели), соперники — над ней.
 * Порядок мест нормализуется здесь, поэтому панель не зависит от того, как отсортировал сервер.
 * Неизвестное место смотрящего и пустой список — тот же порядок: панель лучше показать как есть, чем пустой.
 */
export const panelOrder = (players = [], viewerSeat) => {
  const list = [...(players ?? [])].sort((left, right) => {
    const a = seatOf(left);
    const b = seatOf(right);
    return typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b));
  });
  const at = list.findIndex(player => String(player?.id) === String(viewerSeat));
  if (at < 0) return list;
  return [...list.slice(at + 1), ...list.slice(0, at + 1)];
};

export default panelOrder;
