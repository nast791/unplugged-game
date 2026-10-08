/**
 * Колода Ифрита: 13 уникальных карт, 30 копий, общих карт пула нет. Разбор — `passport.md` §7.
 *
 * Оси героя: **темп** (умение покупает третье действие духом, «Вечный огонь» возвращается в руку,
 * «Счёт ударов» награждает поздний удар) и **позиция** (дальний бой на 3 клетки, сдвиги чужих,
 * «Пепельный ветер» сквозь строй, «Прыжок в лаву»). Карта без свойств в колоде ровно одна.
 */
export default [
  {
    // единственная простая карта колоды: самый крупный удар без условий, поэтому копий две
    id: 'ifrit_01',
    title: 'Столб огня',
    type: 'attack',
    value: 5,
    bonus: 1,
    quantity: 2,
    fighter: 'ifrit',
    text: '',
    rules: [],
  },
  {
    // стихия как сила: на лаве +2, в пустыне +1; на двухцветной клетке сработают оба правила
    id: 'ifrit_02',
    title: 'Жар из-под земли',
    type: 'attack',
    value: 3,
    bonus: 1,
    quantity: 3,
    fighter: 'ifrit',
    text: 'ВО ВРЕМЯ БИТВЫ: Если Ифрит стоит на клетке со стихией лавы, значение карты +2; если на клетке со стихией пустыни — +1.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'FIGHTERS', params: { fighterIds: ['ifrit'], terrain: 'lava' }, min: 1 }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 2 }],
      },
      {
        moment: 'duringCombat',
        when: [{ fact: 'FIGHTERS', params: { fighterIds: ['ifrit'], terrain: 'desert' }, min: 1 }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 1 }],
      },
    ],
  },
  {
    // карта выгорает: сыграна с лавы — вернулась в руку на 1 слабее, на нуле остаётся в сбросе
    id: 'ifrit_03',
    title: 'Вечный огонь',
    type: 'attack',
    value: 3,
    bonus: 1,
    quantity: 2,
    fighter: 'ifrit',
    text: 'ПОСЛЕ БИТВЫ: Если Ифрит стоит на клетке со стихией лавы, положите эту карту обратно в руку со значением на 1 меньше. При значении 0 карта остаётся в сбросе.',
    rules: [
      {
        moment: 'afterCombat',
        when: [{ fact: 'FIGHTERS', params: { fighterIds: ['ifrit'], terrain: 'lava' }, min: 1 }],
        // возвращается именно эта копия: у каждой своё значение, поэтому выгорают они по отдельности
        then: [{ action: 'RECALL_PLAYED_CARD', valueDelta: -1 }],
      },
    ],
  },
  {
    // плата телом за значение: выбрать, какого духа сжечь (клик по подсвеченному духу) или отказаться.
    // Живых духов нет — окна нет и свойства нет; отказался — дух цел, прибавки нет.
    id: 'ifrit_04',
    title: 'Плата пеплом',
    type: 'attack',
    value: 3,
    bonus: 1,
    quantity: 3,
    fighter: 'ifrit',
    text: 'МГНОВЕННО: Можете убить своего пепельного духа; если убили, значение карты +1.',
    rules: [
      {
        moment: 'immediately',
        when: [
          { fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 1 }, var: 'spirits' },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            candidates: '$spirits',
            count: 1,
            required: false,
            // дух остался один — движок отмечает его сам, окна игрок не видит
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [
          { action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 },
          { action: 'SET_COMBAT', op: 'value', side: 'self', delta: 1 },
        ],
      },
    ],
  },
  {
    // единственная защита колоды: платим топливом из колоды, а не картой руки — рука может быть пустой.
    // Дополнительных условий нет: если колода пуста, цена просто не платится (крайний случай, §9).
    id: 'ifrit_05',
    title: 'Пепельный щит',
    type: 'defense',
    value: 3,
    bonus: 2,
    quantity: 2,
    fighter: 'ifrit',
    text: 'МГНОВЕННО: Сбросьте верхнюю карту своей колоды — значение карты +2. Если колода пуста, прибавки нет.',
    rules: [
      {
        moment: 'immediately',
        // цена настоящая: на пустой колоде сбрасывать нечего — прибавки нет, щит остаётся 3
        when: [{ fact: 'DECK', params: { min: 1 } }],
        then: [
          { action: 'SET_CARDS', op: 'discard', from: 'deck', count: 1 },
          { action: 'SET_COMBAT', op: 'value', side: 'self', delta: 2 },
        ],
      },
    ],
  },
  {
    // карта духов: свойство зависит от того, сколько духов ещё живо (3 → 4/4, 2 → 3/3, 1 → добор)
    id: 'ifrit_06',
    title: 'Пепельная стая',
    type: 'hybrid',
    value: 2,
    bonus: 2,
    quantity: 3,
    fighter: 'ash',
    text: 'ВО ВРЕМЯ БИТВЫ: Если на поле три пепельных духа, значение карты +2; если два — +1. ПОСЛЕ БИТВЫ: Если остался один дух, возьмите 1 карту.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 3, max: 3 } }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 2 }],
      },
      {
        moment: 'duringCombat',
        when: [{ fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 2, max: 2 } }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 1 }],
      },
      {
        moment: 'afterCombat',
        when: [{ fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 1, max: 1 } }],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
    ],
  },
  {
    // удар по руке: духи выбивают карту, пока герой держит дистанцию
    id: 'ifrit_07',
    title: 'Пепел в глаза',
    type: 'hybrid',
    value: 2,
    bonus: 2,
    quantity: 2,
    fighter: 'ash',
    text: 'МГНОВЕННО: Противник сбрасывает 1 случайную карту.',
    rules: [
      {
        moment: 'immediately',
        when: [{ fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' }],
        then: [{ action: 'SET_CARDS', of: '$enemy', op: 'discard', random: true, count: 1 }],
      },
    ],
  },
  {
    // выигранная битва отодвигает того, кто подошёл в упор (перемещение необязательное)
    id: 'ifrit_08',
    title: 'Стена огня',
    type: 'hybrid',
    value: 4,
    bonus: 2,
    quantity: 2,
    fighter: 'any',
    text: 'ПОСЛЕ БИТВЫ: Если вы победили, можете сдвинуть бойца противника из этой битвы на 1 клетку.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foes' },
          // атакующий мог погибнуть в бою — тогда двигать некого
          { fact: 'FIGHTERS', params: { fighterIds: '$foes' }, min: 1, var: 'alive' },
        ],
        then: [
          { action: 'SET_MOVEMENT', op: 'open', fighters: '$alive', budget: 1, optional: true },
        ],
      },
    ],
  },
  {
    // победа как источник лечения: единственный хил колоды, и его мало
    id: 'ifrit_09',
    title: 'Пепельный покров',
    type: 'hybrid',
    value: 3,
    bonus: 1,
    quantity: 2,
    fighter: 'any',
    text: 'ПОСЛЕ БИТВЫ: Если вы победили, восстановите 1 здоровье своему бойцу, участвовавшему в битве.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          { fact: 'COMBAT', params: { select: 'self' }, var: 'ours' },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$ours', delta: 1 }],
      },
    ],
  },
  {
    // прыжок в свою стихию: там «Жар из-под земли» бьёт на 5, а «Вечный огонь» возвращается в руку
    id: 'ifrit_10',
    title: 'Прыжок в лаву',
    type: 'effect',
    value: null,
    // бонус 3 — единственная такая карта колоды (правило `docs/hero-algorithm.md` §6)
    bonus: 3,
    quantity: 2,
    fighter: 'ifrit',
    text: 'Поставьте Ифрита на свободную клетку со стихией лавы.',
    rules: [
      {
        moment: 'effect',
        // замороженный не перемещается и не телепортируется: без проверки окно открывалось,
        // а клик падал на `SET_FIGHTER_CELL`
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['ifrit'], frozen: false }, min: 1 },
          {
            fact: 'CELLS',
            params: { terrain: 'lava', free: true },
            min: 1,
            var: 'cells',
          },
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
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SET_FIGHTER_CELL', fighterId: 'ifrit', cellId: '$picked' }],
      },
    ],
  },
  {
    // духи не только плата: сколько их живо, столько клеток он и пройдёт — и сквозь строй.
    // Бонус 4 — единственный в колоде (`docs/hero-algorithm.md` §6) и стоит здесь не случайно:
    // без живых духов свойство мертво, поэтому сбросить карту под усиление почти ничего не стоит
    id: 'ifrit_11',
    title: 'Пепельный ветер',
    type: 'effect',
    value: null,
    bonus: 4,
    quantity: 2,
    fighter: 'ifrit',
    text: 'Сдвиньте Ифрита: он может пройти на столько клеток, сколько живых пепельных духов на поле, в том числе сквозь бойцов противника.',
    rules: [
      {
        moment: 'effect',
        when: [{ fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 3, max: 3 } }],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            fighters: ['ifrit'],
            budget: 3,
            throughEnemies: true,
            optional: true,
          },
        ],
      },
      {
        moment: 'effect',
        when: [{ fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 2, max: 2 } }],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            fighters: ['ifrit'],
            budget: 2,
            throughEnemies: true,
            optional: true,
          },
        ],
      },
      {
        moment: 'effect',
        when: [{ fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 1, max: 1 } }],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            fighters: ['ifrit'],
            budget: 1,
            throughEnemies: true,
            optional: true,
          },
        ],
      },
    ],
  },
  {
    // развилка вместо линейного эффекта: залечиться, добрать карты или выйти из упора.
    // «Три желания» — название из референса (карта Джинна), поэтому карта называется иначе
    id: 'ifrit_12',
    title: 'Три обещания',
    type: 'effect',
    value: null,
    bonus: 1,
    quantity: 3,
    fighter: 'ifrit',
    text: 'Выберите одно свойство:',
    options: [
      { id: 'heal', text: 'Восстановите Ифриту 2 здоровья.' },
      { id: 'draw', text: 'Возьмите 2 карты.' },
      { id: 'step', text: 'Сдвиньте Ифрита на расстояние до 2 клеток.' },
    ],
    rules: [
      {
        moment: 'effect',
        when: [{ fact: 'FIGHTERS', params: { fighterIds: ['ifrit'] }, min: 1 }],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            candidates: ['heal', 'draw', 'step'],
            count: 1,
            required: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', params: { is: 'heal' } },
          { fact: 'FIGHTERS', params: { fighterIds: ['ifrit'] }, min: 1, var: 'hero' },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$hero', delta: 2 }],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', params: { is: 'draw' } }],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 2 }],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', params: { is: 'step' } },
          { fact: 'FIGHTERS', params: { fighterIds: ['ifrit'] }, min: 1, var: 'hero' },
        ],
        then: [
          { action: 'SET_MOVEMENT', op: 'open', fighters: '$hero', budget: 2, optional: true },
        ],
      },
    ],
  },
  {
    // четыре режима: в защиту срезаем чужое число, в атаку свойство зависит от номера действия в ходу.
    // Третий удар возможен только с сожжённым духом (умение даёт лишнее действие) — карта его окупает
    id: 'ifrit_13',
    title: 'Счёт ударов',
    type: 'hybrid',
    value: 2,
    bonus: 2,
    quantity: 2,
    fighter: 'ifrit',
    text: 'ВО ВРЕМЯ БИТВЫ: В защиту значение карты противника снижается на 1. В атаку свойство зависит от номера действия хода: первым — после битвы 1 урон выбранному бойцу противника в области Ифрита; вторым — +2, если ваш боец начал ход на другой клетке; третьим — свойства карты оппонента не действуют.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'COMBAT', params: { role: 'defender' } }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'opponent', delta: -1 }],
      },
      {
        // первое действие хода (потрачено ровно одно действие, см. AP { spentMin, spentMax }):
        // добить выбранного бойца противника в области Ифрита — не «любого на столе»
        moment: 'afterCombat',
        when: [
          { fact: 'AP', params: { min: 0, spentMin: 1, spentMax: 1 } },
          { fact: 'COMBAT', params: { role: 'attacker' } },
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent', areaOf: 'ifrit', min: 1 },
            var: 'foes',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            candidates: '$foes',
            count: 1,
            required: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 }],
      },
      {
        moment: 'duringCombat',
        when: [
          { fact: 'AP', params: { min: 0, spentMin: 2, spentMax: 2 } },
          { fact: 'COMBAT', params: { role: 'attacker' } },
          { fact: 'FIGHTERS', params: { fighterIds: ['ifrit'], movedThisTurn: true }, min: 1 },
        ],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 2 }],
      },
      {
        moment: 'immediately',
        when: [
          { fact: 'AP', params: { min: 0, spentMin: 3, spentMax: 3 } },
          { fact: 'COMBAT', params: { role: 'attacker' } },
          { fact: 'COMBAT', params: { effects: 'opponent' }, min: 1 },
        ],
        then: [{ action: 'SET_COMBAT', op: 'cancelEffects', side: 'opponent' }],
      },
    ],
  },
];
