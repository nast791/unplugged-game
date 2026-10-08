/**
 * Колода Анубиса: 14 уникальных карт, 30 копий, общих карт пула нет. Разбор — `passport.md` §7.
 *
 * Оси героя: **позиция** (покой, своя область, песок — «Погребальный звон», «Песчаный саван»,
 * «Суд молчит», пелена) и **контроль** (Амат ест карты: «Амат ждёт», «Печать Маат», «Немой приговор»,
 * «Амат разрывает»). Умение не повторяет ни одна карта: небоевой урон в области за покой делает только
 * «Взвешивание сердца» (`index.js`).
 */
export default [
  {
    // главный удар: существует только у стоящего — шагнул, и карта снова 4
    id: 'anubis_01',
    title: 'Погребальный звон',
    type: 'attack',
    value: 4,
    bonus: 1,
    quantity: 3,
    fighter: 'anubis',
    text: 'ВО ВРЕМЯ БИТВЫ: Если Анубис не двигался в этом ходу, значение карты становится 6.',
    rules: [
      {
        moment: 'duringCombat',
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], movedThisTurn: true }, max: 0 },
        ],
        // `to`, а не `delta`: значение ровно 6, его нельзя случайно сложить с чужими прибавками
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', to: 6 }],
      },
    ],
  },
  {
    // урон, а не прибавка: высокая защита врага карту не спасает
    id: 'anubis_02',
    title: 'Песчаная буря',
    type: 'attack',
    value: 3,
    bonus: 1,
    quantity: 2,
    fighter: 'anubis',
    text: 'МГНОВЕННО: Если боец оппонента в этой битве стоит на клетке со стихией пустыни, он получает 1 урон.',
    rules: [
      {
        moment: 'immediately',
        when: [
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
          { fact: 'FIGHTERS', params: { fighterIds: '$foe', terrain: 'desert' }, min: 1 },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$foe', delta: -1 }],
      },
    ],
  },
  {
    // суд над излишком: чем больше враг копит, тем меньше у него останется на ответ
    id: 'anubis_03',
    title: 'Печать Маат',
    type: 'attack',
    value: 4,
    bonus: 1,
    quantity: 2,
    fighter: 'anubis',
    text: 'МГНОВЕННО: Если в руке оппонента 4 карты или больше, он сбрасывает 1 случайную карту.',
    rules: [
      {
        moment: 'immediately',
        when: [
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          { fact: 'HAND', params: { of: '$enemy', min: 4 } },
        ],
        then: [{ action: 'SET_CARDS', of: '$enemy', op: 'discard', random: true, count: 1 }],
      },
    ],
  },
  {
    // зеркальная защита: сила карты — чужая, её берут из усиления атаки оппонента
    id: 'anubis_04',
    title: 'Саван',
    type: 'defense',
    value: 0,
    bonus: 2,
    quantity: 3,
    fighter: 'anubis',
    text: 'ВО ВРЕМЯ БИТВЫ: Значение карты становится равным усилению карты, которой напали на вас.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'COMBAT', params: { bonus: 'opponent' }, var: 'bonus' }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', to: '$bonus' }],
      },
    ],
  },
  {
    // выигранная битва выталкивает врага, но сдвиг необязательный: иногда выгоднее оставить его в области
    id: 'anubis_05',
    title: 'Врата',
    type: 'hybrid',
    value: 3,
    bonus: 2,
    quantity: 2,
    fighter: 'anubis',
    text: 'ПОСЛЕ БИТВЫ: Если вы победили, можете сдвинуть бойца оппонента из этой битвы на 1 клетку.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foes' },
          // боец оппонента мог погибнуть в бою — тогда двигать некого
          { fact: 'FIGHTERS', params: { fighterIds: '$foes' }, min: 1, var: 'alive' },
        ],
        then: [
          { action: 'SET_MOVEMENT', op: 'open', fighters: '$alive', budget: 1, optional: true },
        ],
      },
    ],
  },
  {
    // пустая рука врага — плата за продолжение: контроль превращается в карту
    id: 'anubis_06',
    title: 'Немой приговор',
    type: 'hybrid',
    value: 2,
    bonus: 2,
    quantity: 2,
    fighter: 'anubis',
    text: 'ПОСЛЕ БИТВЫ: Если в руке оппонента нет карт, возьмите карту.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          { fact: 'HAND', params: { of: '$enemy', max: 0 } },
        ],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
    ],
  },
  {
    // единственная карта без привязки к бойцу: играется и за Амат, и за Анубиса
    id: 'anubis_07',
    title: 'Песчаный саван',
    type: 'hybrid',
    value: 3,
    bonus: 2,
    quantity: 2,
    fighter: 'any',
    text: 'ВО ВРЕМЯ БИТВЫ: Если ваш боец в этой битве стоит на клетке со стихией пустыни, значение карты становится 4.',
    rules: [
      {
        moment: 'duringCombat',
        when: [
          { fact: 'COMBAT', params: { select: 'self' }, var: 'ours' },
          { fact: 'FIGHTERS', params: { fighterIds: '$ours', terrain: 'desert' }, min: 1 },
        ],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', to: 4 }],
      },
    ],
  },
  {
    // усиление работает ресурсом: шаг Амат равен тому, что лежало сверху колоды.
    // Цена — карту видят все, и она уходит под низ колоды, то есть вернётся не скоро
    id: 'anubis_08',
    title: 'Канопа',
    type: 'hybrid',
    value: 2,
    bonus: 2,
    quantity: 2,
    fighter: 'anubis',
    text: 'ПОСЛЕ БИТВЫ: Если вы победили, раскройте верхнюю карту своей колоды; Амат проходит на расстояние, равное усилению раскрытой карты, затем положите раскрытую карту под низ колоды.',
    rules: [
      {
        moment: 'afterCombat',
        when: [{ fact: 'COMBAT', params: { winner: 'self' } }],
        then: [{ action: 'SET_REVEAL', op: 'open', of: 'self', count: 1 }],
      },
      {
        // усиление есть и Амат жива — двигаем зверя. Карту под низ уберёт следующее правило: своё
        // действие правило выполняет в том же моменте, а «затем положите» в тексте карты — шаг после
        // движения (движение открывает окно, очередь боя ждёт его конца и продолжает со следующего шага)
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          { fact: 'REVEALED', params: { of: 'self', select: 'bonus' }, min: 1, var: 'bonus' },
          { fact: 'FIGHTERS', params: { side: 'self', group: 'amat' }, min: 1, var: 'beast' },
        ],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            fighters: '$beast',
            budget: '$bonus',
            optional: true,
          },
        ],
      },
      {
        // раскрытие открыто — снимаем снимок: Амат прошла (или идти некому: усиления нет, зверь убит),
        // и карта уходит под низ. Правило одно на все исходы: два «убирающих» правила сработали бы
        // подряд — первое снимает снимок, второе убирает то, чего в раскрытии уже нет
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          { fact: 'REVEALED', params: { of: 'self', select: 'cards' }, min: 1 },
        ],
        then: [{ action: 'SET_REVEAL', op: 'bottom', of: 'self' }],
      },
    ],
  },
  {
    // покой как ресурс: тихий ход — карта и здоровье
    id: 'anubis_09',
    title: 'Суд молчит',
    type: 'effect',
    value: null,
    bonus: 2,
    quantity: 3,
    fighter: 'anubis',
    text: 'Если Анубис не двигался в этом ходу, возьмите карту и восстановите ему 1 здоровье.',
    rules: [
      {
        moment: 'effect',
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], movedThisTurn: true }, max: 0 },
        ],
        then: [
          { action: 'SET_CARDS', op: 'draw', count: 1 },
          { action: 'SET_HEALTH', fighterIds: ['anubis'], delta: 1 },
        ],
      },
    ],
  },
  {
    // план Б: возврата у Амат нет, поэтому колода даёт за потерю зверя топливо
    id: 'anubis_10',
    title: 'Плач по Амат',
    type: 'effect',
    value: null,
    bonus: 1,
    quantity: 3,
    fighter: 'anubis',
    text: 'Если Амат убита, возьмите 2 карты.',
    rules: [
      {
        moment: 'effect',
        when: [{ fact: 'LOST', params: { type: 'assistant' }, min: 1 }],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 2 }],
      },
    ],
  },
  {
    // продолжительный эффект: предмет остаётся на столе, пока герой держит песок.
    // Бонус 3 — единственная такая карта колоды (правило `docs/hero-algorithm.md` §6)
    id: 'anubis_11',
    title: 'Погребальная пелена',
    type: 'effect',
    value: null,
    bonus: 3,
    quantity: 1,
    fighter: 'anubis',
    text: 'Положите пелену. Пока она цела, «Взвешивание сердца» наносит 2 урона вместо 1. В начале вашего хода пелена рвётся, если Анубис не стоит на клетке со стихией пустыни.',
    rules: [
      {
        // пелена — не расходуемая карта, а продолжительный эффект: карта включает предмет,
        // а состояние предмета (и его условие) игрок видит в панели все партии
        moment: 'effect',
        then: [{ action: 'SET_ITEM', group: 'shroud', to: 'active' }],
      },
    ],
  },
  {
    // единственная карта, которая сама ломает покой: дойти до песка или выйти из окружения
    id: 'anubis_12',
    title: 'Путь на закат',
    type: 'effect',
    value: null,
    bonus: 1,
    quantity: 2,
    fighter: 'anubis',
    text: 'Анубис проходит до 2 клеток.',
    rules: [
      {
        moment: 'effect',
        then: [
          { action: 'SET_MOVEMENT', op: 'open', fighters: ['anubis'], budget: 2, optional: true },
        ],
      },
    ],
  },
  {
    // карта Амат, но id — героя: у помощников своих префиксов нет (`docs/hero-algorithm.md` §7).
    // Первая форма «поедания»: победа Амат стоит врагу карты
    id: 'anubis_13',
    title: 'Амат ждёт',
    type: 'attack',
    value: 4,
    bonus: 1,
    quantity: 2,
    fighter: 'amat',
    text: 'ПОСЛЕ БИТВЫ: Если вы победили, оппонент сбрасывает 1 случайную карту.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
        ],
        then: [{ action: 'SET_CARDS', of: '$enemy', op: 'discard', random: true, count: 1 }],
      },
    ],
  },
  {
    // вторая форма «поедания»: зверь вырывает защиту из рук. Экшен сам решает,
    // есть ли защитнику чем меняться: нет — защиты нет, есть — окно обязательное.
    // Тип — атака, а не гибрид (решение владельца): свойство говорит про защищающегося,
    // то есть работает только когда бьёт зверь; в защиту карта была бы мёртвым текстом
    id: 'anubis_14',
    title: 'Амат разрывает',
    type: 'attack',
    value: 3,
    bonus: 2,
    quantity: 1,
    fighter: 'amat',
    text: 'ВО ВРЕМЯ БИТВЫ: Защищающийся сбрасывает выложенную карту и защищается другой картой защиты или гибридом; если такой карты нет — защита 0.',
    rules: [
      {
        moment: 'duringCombat',
        then: [{ action: 'SET_COMBAT', op: 'replaceDefense' }],
      },
    ],
  },
];
