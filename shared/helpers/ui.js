/**
 * Ждёт ли интерфейс клика по бойцу. Флаг ставит сама фаза (`ui.pickFighters`):
 * - `attack` — пока не выбран атакующий или цель (`stage: attacker | target`);
 * - `choose` — пока открыто окно выбора цели с бойцами.
 * Подсветка бойцов — не то же самое: на стадии защиты цель подсвечена, но клик по ней уже ничего не решает,
 * а перемещение и расстановка подсвечивают бойцов для выбора кликом по клетке.
 */
export const fighterPickExpected = ui => ui?.pickFighters === true;

/**
 * Что значит клик по бойцу, по данным `runUi`. Решает движок, а клиент только исполняет:
 * - `pick` — клик уходит движку как выбор кандидата (бой, окно выбора цели, способность);
 * - `select` — бойца просто выбираем, дальше клик по клетке (перемещение и расстановка);
 * - `refuse` — клик сейчас ничего не значит.
 * Подсвеченный боец выбирается и тогда, когда он чужой: принудительное перемещение двигает врагов
 * (например, свойство «передвиньте вражеских бойцов»), поэтому «своих» здесь недостаточно.
 */
export const fighterClickIntent = (ui, fighterId, myFighterIds = []) => {
  const id = fighterId == null ? '' : String(fighterId);
  if (id === '') return 'refuse';

  const highlighted = (ui?.highlightedFighterIds ?? []).map(String);
  if (highlighted.includes(id)) {
    return fighterPickExpected(ui) ? 'pick' : 'select';
  }

  return (myFighterIds ?? []).map(String).includes(id) ? 'select' : 'refuse';
};

export default fighterPickExpected;
