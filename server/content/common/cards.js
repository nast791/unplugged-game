/**
 * Общие карты: библиотека, из которой герой добирает колоду до 30 карт.
 *
 * Зачем: половина колоды у всех героев одинаковая — это ускоряет выпуск героев, даёт игроку
 * узнаваемый «общий язык» колод и служит ручкой баланса. Подробности и подсчёт по референсам —
 * `docs/common-cards.md`.
 *
 * Как устроено:
 * - **Своих копий у героя не фиксировано:** герой берёт только те карты, которых ему не хватает,
 *   и в том количестве копий, которое нужно для баланса (`quantity` 1–3). Не все четыре карты
 *   обязаны быть у одного героя: может не быть ни одной, если герой собирает 30 карт сам.
 * - **Привязки к бойцу нет** (`fighter` не указан): такую карту может играть любой боец — движок
 *   считает карту без привязки доступной всегда (`hasFighterForCard`). Из-за этого в правилах
 *   нельзя ссылаться на конкретного бойца по id: свои бойцы выбираются фактом
 *   `FIGHTERS { side: 'self', ... }`.
 * - **Порядок работы:** сначала уникальные механики и карты героя, потом добор общими до 30 карт.
 *   Эти карты — не «обязательная программа», а балансировочный остаток.
 *
 * Формат карты — как в колодах героев (`server/content/heroes/<герой>/cards.js`).
 * Числа — наши: сверка со сканами (`.refs/_stats`) показала, что прежние совпадали с самыми
 * частыми сигнатурами оригинала (`docs/common-cards.md` §3).
 */

const cards = [
  {
    // аналог самой ходовой карты жанра: у 27 из 64 разобранных героев
    id: 'common_feint',
    title: 'Обманный маневр',
    type: 'hybrid',
    value: 2,
    bonus: 1,
    quantity: 2,
    text: 'МГНОВЕННО: Свойства карты оппонента в этой битве не действуют.',
    rules: [
      {
        moment: 'immediately',
        // у карты противника нет ни одного свойства — отменять нечего, шаг помечается skipped
        when: [{ fact: 'COMBAT', params: { effects: 'opponent' }, min: 1 }],
        // отменяем тексты карты противника: её шаги в очереди боя помечаются cancelled.
        // Числа карты при этом не меняются: отменяются свойства, а не значение.
        then: [{ action: 'SET_COMBAT', op: 'cancelEffects', side: 'opponent' }],
      },
    ],
  },
  {
    // добор после боя: экономика, которой герою обычно не хватает
    id: 'common_breather',
    title: 'Пауза',
    type: 'hybrid',
    value: 2,
    bonus: 2,
    quantity: 2,
    text: 'ПОСЛЕ БИТВЫ: Доберите карту. В случае вашей победы доберите две.',
    rules: [
      // условия взаимоисключающие: срабатывает ровно одно правило
      {
        moment: 'afterCombat',
        when: [{ fact: 'COMBAT', params: { winner: 'self' } }],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 2 }],
      },
      {
        moment: 'afterCombat',
        when: [{ fact: 'COMBAT', params: { winner: 'opponent' } }],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
    ],
  },
  {
    // позиция после победы: не даёт «залипнуть» в бою и уводит из-под ответа
    id: 'common_fall_back',
    title: 'Отход',
    type: 'hybrid',
    value: 3,
    bonus: 1,
    quantity: 2,
    text: 'ПОСЛЕ БИТВЫ: Если вы победили, ваш боец, участвовавший в битве, может пройти до двух клеток.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          // двигается тот, кто играл карту: у атакующего — атакующий, у защитника — тот, кого били
          { fact: 'COMBAT', params: { select: 'self' }, var: 'fighters' },
        ],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            budget: 2,
            fighters: '$fighters',
            optional: true,
          },
        ],
      },
    ],
  },
  {
    // условное значение за движение: награда за манёвр, наказание за стояние
    id: 'common_spurt',
    title: 'Разбег',
    type: 'attack',
    value: 4,
    bonus: 1,
    quantity: 2,
    text: 'ВО ВРЕМЯ БИТВЫ: Если ваш боец в этом ходу перемещался, значение карты +2.',
    rules: [
      {
        moment: 'duringCombat',
        // флаг «двигался в этом ходу» ставит SET_FIGHTER_CELL, снимает начало хода
        when: [{ fact: 'FIGHTERS', params: { side: 'self', movedThisTurn: true }, min: 1 }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 2 }],
      },
    ],
  },
  {
    // ответ на рой: помощники врага лезут в область, где стоит наш боец, — залп их снимает
    id: 'common_volley',
    title: 'Залп',
    type: 'attack',
    value: 2,
    bonus: 2,
    quantity: 1,
    text: 'ПОСЛЕ БОЯ: 1 урон всем бойцам противника в области вашего бойца.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          // свой боец из этой битвы: он ещё на поле, и его область известна
          { fact: 'COMBAT', params: { select: 'self' }, var: 'ours' },
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent', areaOf: '$ours' },
            min: 1,
            var: 'foes',
          },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$foes', delta: -1 }],
      },
    ],
  },
  {
    // ответ на потерю помощника: поднимает любого убитого помощника в область своего героя
    id: 'common_recall',
    title: 'Подмога',
    type: 'effect',
    value: null,
    bonus: 2,
    quantity: 1,
    text: 'Верните убитого помощника в область вашего героя.',
    rules: [
      {
        moment: 'effect',
        when: [
          { fact: 'LOST', params: { type: 'assistant' }, min: 1, var: 'lost' },
          { fact: 'FIGHTERS', params: { side: 'self', type: 'hero' }, min: 1, var: 'heroes' },
          { fact: 'CELLS', params: { areaOf: '$heroes', free: true }, min: 1, var: 'cells' },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'cells',
            candidates: '$cells',
            count: 1,
            required: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', var: 'picked' },
          { fact: 'LOST', params: { type: 'assistant' }, min: 1, var: 'lost' },
        ],
        then: [{ action: 'REVIVE_FIGHTER', groups: '$lost', cellId: '$picked' }],
      },
    ],
  },
];

export default cards;

/**
 * Карта общего пула под колоду героя: id карты и нужное герою число копий. Название, тип, значение
 * и правила берутся из пула — герой задаёт только количество, поэтому одна и та же карта не живёт
 * в двух файлах. Так колода собирается как `[...свои карты, ...взятые общие]`.
 */
export const commonCard = (id, quantity) => {
  const card = cards.find(entry => entry.id === id);
  if (!card) throw new Error(`общий пул: нет карты "${id}"`);
  return { ...card, quantity };
};
