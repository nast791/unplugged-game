/**
 * Реестр статусов бойца: одно место, где у статуса есть id, название, иконка, описание и **что он
 * запрещает**. Реестр — источник правды и для движка (что вообще можно поставить), и для интерфейса
 * (чем рисовать), и для контента (какой id писать в правиле карты).
 *
 * **Срок в реестре не хранится** — он принадлежит экземпляру статуса. «Заморожен до конца своего хода»,
 * «до конца чужого хода» и «до явной отмены» — это разные условия у одного и того же `frozen`, поэтому
 * срок ставится вместе со статусом: `fighter.statuses[id] = { until }`.
 *
 * Как ставится из карты (правило `immediately` / `duringCombat` / `afterCombat` / …):
 *
 * ```js
 * { action: 'SET_STATUS', fighterIds: '$foe', status: 'frozen', value: true }
 * { action: 'SET_STATUS', fighterIds: '$foe', status: 'frozen', value: true, until: 'ownerTurnEnd' }
 * ```
 *
 * и как снимается досрочно — тем же действием с `value: false` (это и есть «любое другое условие»:
 * снимает то правило, которое знает условие).
 *
 * `fighterIds` — id бойца, список, объект факта (`{ fighterId }`) или переменная условия (`'$foe'`):
 * разбирает само действие (`shared/actions/status.js`). Запреты движок читает **отсюда**:
 * `blockingStatus(fighter, 'move' | 'teleport')` — этим закрыты шаг, перенос, обмен и принудительное
 * перемещение (`shared/actions/fighter.js`, `shared/helpers/turn.js`).
 */
export const STATUSES = {
  frozen: {
    id: 'frozen',
    title: 'Заморозка',
    // Иконка отличается от осколков Снежной королевы (`lucide:snowflake`): снежинка, но не та же.
    icon: 'material-symbols:ac-unit',
    text: 'Не может перемещаться и телепортироваться.',
    forbids: ['move', 'teleport'],
  },
};

/** id статусов: порядок реестра — порядок иконок у фишки (первый ближе к сердцу). */
export const STATUS_IDS = Object.keys(STATUSES);

/** Что делать запрещено: `move` — шаг и принудительное перемещение, `teleport` — перенос без прохода. */
export const STATUS_FORBIDS = ['move', 'teleport'];

/**
 * Когда статус снимается сам (`until` в записи статуса). Список закрытый: движок умеет отпускать статус
 * только по этим условиям, всё остальное снимает правило карты действием `SET_STATUS { value: false }`.
 *
 * - `turnEnd` (по умолчанию) — на ближайшем конце хода, чей бы он ни был: это «до конца текущего хода»;
 * - `ownerTurnEnd` — в конце хода **владельца бойца**: это «до конца его хода». Если статус поставлен в
 *   чужой ход, он переживёт его и снимется только когда до владельца дойдёт очередь.
 */
export const STATUS_UNTIL = ['turnEnd', 'ownerTurnEnd'];

/** Срок по умолчанию: ставится, если правило не назвало свой. */
export const STATUS_UNTIL_DEFAULT = 'turnEnd';

/** Статус по id: неизвестный — `null`, а не исключение (реестр читают и интерфейс, и правила). */
export const statusOf = id => STATUSES[String(id)] ?? null;

/**
 * Запись статуса на бойце: `{ until }` из нового вида (`fighter.statuses`) или из старого прямого поля
 * (`fighter.frozen = true` — такие партии ещё могут быть в памяти и в `sessionStorage`).
 */
export const statusEntry = (fighter, id) => {
  const entry = fighter?.statuses?.[String(id)];
  if (entry != null) return { until: String(entry.until ?? STATUS_UNTIL_DEFAULT) };

  return fighter?.[String(id)] === true ? { until: STATUS_UNTIL_DEFAULT } : null;
};

/** Стоит ли на бойце статус — с учётом обоих видов записи. */
export const hasStatus = (fighter, id) => statusEntry(fighter, id) != null;

/** Действующие статусы бойца, в порядке реестра: запись реестра плюс `until` экземпляра. */
export const fighterStatuses = fighter =>
  STATUS_IDS.map(id => {
    const entry = statusEntry(fighter, id);
    const status = statusOf(id);

    return entry == null || status == null ? null : { ...status, until: entry.until };
  }).filter(Boolean);

/**
 * Какой статус бойца запрещает действие `kind`: `null` — не запрещено. Движок спрашивает это вместо
 * проверки конкретного поля, поэтому новый статус с запретом работает без правки механик, которые он
 * закрывает.
 */
export const blockingStatus = (fighter, kind) =>
  STATUS_IDS.find(id => hasStatus(fighter, id) && STATUSES[id].forbids.includes(String(kind))) ??
  null;

/**
 * Снять с бойца статусы, чей срок вышел на этом конце хода. Возвращает id снятых — по ним видно в логах и
 * тестах, что именно отпустили. Зовётся из `shared/lifecycle/turnEnd.js`, больше ниоткуда: срок статуса —
 * единственное место, где движок снимает статус сам.
 */
export const releaseStatuses = (fighter, { playerId = null, ownerId = null } = {}) => {
  if (fighter == null) return [];
  const sameOwner = playerId != null && ownerId != null && String(playerId) === String(ownerId);
  const released = [];

  for (const id of STATUS_IDS) {
    const entry = statusEntry(fighter, id);
    if (entry == null) continue;
    if (entry.until === 'ownerTurnEnd' && !sameOwner) continue;
    released.push(id);

    if (fighter.statuses != null) {
      delete fighter.statuses[id];
      if (Object.keys(fighter.statuses).length === 0) delete fighter.statuses;
    }
    // старое прямое поле тоже убираем: статус не должен пережить собственное снятие
    delete fighter[id];
  }

  return released;
};
