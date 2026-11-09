/**
 * Колода Ифрита: 14 уникальных карт, 30 копий, общих карт пула нет. Разбор — `passport.md` §7.
 *
 * Оси героя: **темп** (умение покупает третье действие духом, «Вечный огонь» возвращается в руку,
 * «Счёт ударов» награждает поздний удар) и **позиция** (дальний бой на 3 клетки, сдвиги чужих,
 * «Пепельный ветер» сквозь строй, «Ожог» отталкивает соседа). Карта без свойств в колоде ровно одна.
 */
export default [
  {
    // единственная простая карта колоды: самый крупный удар без условий, поэтому копий две
    id: 'ifrit_01',
    title: 'Столб огня',
    type: 'attack',
    value: 6,
    bonus: 1,
    quantity: 2,
    fighter: 'ifrit',
    text: '',
    rules: [],
  },
  {
    // наказание за бой на своей земле: урон бойцу и сброс карты из чужой руки
    id: 'ifrit_02',
    title: 'Жар из-под земли',
    type: 'attack',
    value: 4,
    bonus: 3,
    quantity: 3,
    fighter: 'ifrit',
    text: 'ПОСЛЕ БИТВЫ: Если Ифрит стоит на клетке со стихией лавы, нанесите бойцу противника из этой битвы 2 урона, оппонент сбрасывает 1 случайную карту.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['ifrit'], terrain: 'lava' }, min: 1 },
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foes' },
          { fact: 'FIGHTERS', params: { fighterIds: '$foes' }, min: 1 },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
        ],
        then: [
          { action: 'SET_HEALTH', fighterIds: '$foes', delta: -2 },
          { action: 'SET_CARDS', of: '$enemy', op: 'discard', random: true, count: 1 },
        ],
      },
    ],
  },
  {
    // карта выгорает: сыграна с лавы — вернулась в руку на 1 слабее, на нуле остаётся в сбросе
    id: 'ifrit_03',
    title: 'Вечный огонь',
    type: 'attack',
    value: 3,
    bonus: 2,
    quantity: 1,
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
    value: 4,
    bonus: 3,
    quantity: 3,
    fighter: 'ifrit',
    text: 'МГНОВЕННО: Можете уничтожить своего пепельного духа. Если вы это сделали, значение этой карты становится 6. ПОСЛЕ БИТВЫ: Если вы победили, возьмите 1 карту.',
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
          { action: 'SET_COMBAT', op: 'value', side: 'self', to: 6 },
        ],
      },
      {
        moment: 'afterCombat',
        when: [{ fact: 'COMBAT', params: { winner: 'self' } }],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
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
    // карта духов: свойство зависит от того, сколько духов ещё живо (3 → +3, 2 → +2, 1 → +1)
    id: 'ifrit_06',
    title: 'Пепельная стая',
    type: 'hybrid',
    value: 2,
    bonus: 3,
    quantity: 3,
    fighter: 'ash',
    text: 'ВО ВРЕМЯ БИТВЫ: Если на поле три пепельных духа, значение карты +3; если два — +2; если один — +1.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 3, max: 3 } }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 3 }],
      },
      {
        moment: 'duringCombat',
        when: [{ fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 2, max: 2 } }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 2 }],
      },
      {
        moment: 'duringCombat',
        when: [{ fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 1, max: 1 } }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 1 }],
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
    fighter: 'any',
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
    // добор за битву, а победа поджигает клетку под Ифритом: добавка живёт до конца хода
    // владельца, поэтому годится и в защиту — на свой ход Ифрит уже стоит на лаве
    id: 'ifrit_08',
    title: 'Стена огня',
    type: 'hybrid',
    value: 4,
    bonus: 2,
    quantity: 2,
    fighter: 'any',
    text: 'ПОСЛЕ БИТВЫ: Доберите 1 карту. Если вы победили, клетка Ифрита до конца вашего хода получает дополнительную стихию лавы, если на ней меньше 3 стихий.',
    rules: [
      {
        moment: 'afterCombat',
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          { fact: 'FIGHTERS', params: { fighterIds: ['ifrit'] }, var: 'hero' },
        ],
        then: [
          { action: 'SET_CELL_TERRAIN', op: 'add', cellId: '$hero', terrain: 'lava' },
        ],
      },
    ],
  },
  {
    // отталкивание: бьёт соседа и отбрасывает его до двух клеток — разрыв дистанции с ближником
    id: 'ifrit_10',
    title: 'Ожог',
    type: 'effect',
    value: null,
    // бонус 3 — единственная такая карта колоды (правило `docs/hero-algorithm.md` §6)
    bonus: 3,
    quantity: 2,
    fighter: 'ifrit',
    text: 'Нанесите 2 урона любому бойцу на соседней клетке. Переместите этого бойца на расстояние до 2 клеток.',
    rules: [
      {
        moment: 'effect',
        when: [
          { fact: 'FIGHTERS', params: { withinOf: 'ifrit', within: 1 }, min: 1, var: 'targets' },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'fighters',
            candidates: '$targets',
            count: 1,
            required: true,
            // сосед остался один — движок отмечает его сам
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', var: 'picked' },
          { fact: 'FIGHTERS', params: { fighterIds: '$picked' }, min: 1 },
        ],
        then: [
          { action: 'SET_HEALTH', fighterIds: '$picked', delta: -2 },
          // боец мог погибнуть от урона: без `source` окно перемещения не открывается само
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            fighters: '$picked',
            budget: 2,
            optional: true,
            source: 'ifrit_10',
          },
        ],
      },
    ],
  },
  {
    // духи не только плата: сколько их живо плюс два, столько клеток он и пройдёт — и сквозь строй,
    // забирая здоровье у каждого, через кого прошёл. Бонус 3: без живых духов свойство слабеет до
    // двух клеток, а сбросить карту под усиление дёшево
    id: 'ifrit_11',
    title: 'Пепельный ветер',
    type: 'effect',
    value: null,
    bonus: 3,
    quantity: 2,
    fighter: 'ifrit',
    text: 'Переместите Ифрита: он может пройти на столько клеток, сколько живых пепельных духов на поле + 2, в том числе сквозь бойцов противника. Проходя сквозь бойца противника, он крадёт у него 1 здоровье.',
    rules: [
      {
        moment: 'effect',
        when: [{ fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 3, max: 3 } }],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            fighters: ['ifrit'],
            budget: 5,
            throughEnemies: true,
            damageOnPass: 1,
            healOnPass: 1,
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
            budget: 4,
            throughEnemies: true,
            damageOnPass: 1,
            healOnPass: 1,
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
            budget: 3,
            throughEnemies: true,
            damageOnPass: 1,
            healOnPass: 1,
            optional: true,
          },
        ],
      },
      {
        // духов не осталось — свойство всё равно работает: «сколько духов + 2» = две клетки
        moment: 'effect',
        when: [{ fact: 'FIGHTERS', params: { side: 'self', group: 'ash', min: 0, max: 0 } }],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            fighters: ['ifrit'],
            budget: 2,
            throughEnemies: true,
            damageOnPass: 1,
            healOnPass: 1,
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
      {
        id: 'step',
        text: 'Сдвиньте Ифрита на расстояние до 2 клеток. Клетка, на которую он наступил, до конца вашего хода получает дополнительную стихию лавы, если на ней меньше 3 стихий.',
      },
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
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            fighters: '$hero',
            budget: 2,
            optional: true,
            terrainOnStep: 'lava',
          },
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
    value: 5,
    bonus: 1,
    quantity: 2,
    fighter: 'ifrit',
    text: 'ВО ВРЕМЯ БИТВЫ: В защиту значение карты противника снижается на 1. В атаку свойство зависит от номера действия хода: первым — после битвы 1 урон выбранному бойцу противника; вторым — свойства карты оппонента не действуют; третьим — +2, если ваш боец начал ход на другой клетке.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'COMBAT', params: { role: 'defender' } }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'opponent', delta: -1 }],
      },
      {
        // первое действие хода (потрачено ровно одно действие, см. AP { spentMin, spentMax }):
        // добить выбранного бойца противника — выбор настоящий, поэтому окно обязательное
        moment: 'afterCombat',
        when: [
          { fact: 'AP', params: { min: 0, spentMin: 1, spentMax: 1 } },
          { fact: 'COMBAT', params: { role: 'attacker' } },
          { fact: 'FIGHTERS', params: { side: 'opponent', min: 1 }, var: 'foes' },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            candidates: '$foes',
            count: 1,
            required: true,
            // единственный враг на столе — движок отмечает его сам, окна игрок не видит
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 }],
      },
      {
        moment: 'immediately',
        when: [
          { fact: 'AP', params: { min: 0, spentMin: 2, spentMax: 2 } },
          { fact: 'COMBAT', params: { role: 'attacker' } },
          { fact: 'COMBAT', params: { effects: 'opponent' }, min: 1 },
        ],
        then: [{ action: 'SET_COMBAT', op: 'cancelEffects', side: 'opponent' }],
      },
      {
        moment: 'duringCombat',
        when: [
          { fact: 'AP', params: { min: 0, spentMin: 3, spentMax: 3 } },
          { fact: 'COMBAT', params: { role: 'attacker' } },
          { fact: 'FIGHTERS', params: { fighterIds: ['ifrit'], movedThisTurn: true }, min: 1 },
        ],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 2 }],
      },
    ],
  },
  {
    // по площади и без выбора: достаётся и своим — Ифрит бьёт по клеткам, а не по названной цели.
    // Ифриту урон не достаётся: его собственная клетка в радиус не входит
    id: 'ifrit_14',
    title: 'Сжечь всех дотла',
    type: 'effect',
    value: null,
    bonus: 2,
    quantity: 1,
    fighter: 'ifrit',
    text: 'Нанесите 2 урона всем бойцам всех игроков в радиусе 2 клеток от Ифрита. Своим бойцам (кроме Ифрита) также наносится урон.',
    rules: [
      {
        moment: 'effect',
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['ifrit'] }, min: 1 },
          {
            fact: 'FIGHTERS',
            params: { withinOf: 'ifrit', within: 2 },
            min: 1,
            var: 'victims',
          },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$victims', delta: -2 }],
      },
    ],
  },
  {
    // ответная искра: на лаве горит сильнее, а после битвы жалит того, кто напал
    id: 'ifrit_15',
    title: 'Искры',
    type: 'hybrid',
    value: 2,
    bonus: 2,
    quantity: 2,
    fighter: 'ifrit',
    text: 'ВО ВРЕМЯ БИТВЫ: Если Ифрит стоит на клетке лавы, значение этой карты становится 4. ПОСЛЕ БИТВЫ: Нанесите 1 урон атаковавшему бойцу.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'FIGHTERS', params: { fighterIds: ['ifrit'], terrain: 'lava' }, min: 1 }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', to: 4 }],
      },
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { role: 'defender' } },
          { fact: 'COMBAT', params: { select: 'attacker' }, var: 'foe' },
          { fact: 'FIGHTERS', params: { fighterIds: '$foe' }, min: 1 },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$foe', delta: -1 }],
      },
    ],
  },
];
