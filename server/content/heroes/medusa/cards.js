/** Колода Медузы. */
export default [
  {
    id: 'medusa_01',
    title: 'Взгляд смерти',
    type: 'attack',
    value: 2,
    bonus: 4,
    quantity: 3,
    fighter: 'medusa',
    text: 'ПОСЛЕ БИТВЫ: В случае вашей победы нанесите 8 урона атакованному бойцу.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          // победителем боя объявлен атакующий (эту карту играет только атакующий)
          { fact: 'COMBAT', params: { winner: 'attacker' } },
          // атакованный боец — тот, кого выбрали целью атаки (герой или помощник)
          { fact: 'COMBAT', params: { select: 'target' }, var: 'victims' },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$victims', delta: -8 }],
      },
    ],
  },
  {
    id: 'medusa_02',
    title: 'Град стрел',
    type: 'attack',
    value: 3,
    bonus: 3,
    quantity: 3,
    fighter: 'medusa',
    text: 'ВО ВРЕМЯ БИТВЫ: Можете сбросить карту с руки — её бонус прибавится к атаке этой карты.',
    rules: [
      {
        moment: 'duringCombat',
        // усиливать нечем, если в руке нет другой карты с бонусом: тогда эффект не срабатывает
        when: [{ fact: 'HAND', params: { bonusMin: 1 }, min: 1, var: 'cards' }],
        then: [
          {
            action: 'SET_COMBAT',
            op: 'choice',
            effect: 'bonus',
            side: 'attack',
            max: 1,
            candidates: '$cards',
            optional: true,
          },
        ],
      },
    ],
  },
  {
    id: 'medusa_03',
    title: 'Шепот змей',
    type: 'defense',
    value: 4,
    bonus: 3,
    quantity: 3,
    fighter: 'medusa',
    text: 'ПОСЛЕ БИТВЫ: Оппонент, чей боец участвовал в этой битве, сбрасывает 1 карту из своей руки.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          // кто враг в этом бою: id игрока (не список), чтобы подставить его и в руку, и в окно
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          // без карт в руке сбрасывать нечего: эффект не срабатывает, штрафов никаких
          { fact: 'HAND', params: { of: '$enemy', min: 1 }, var: 'enemyCards' },
        ],
        then: [
          {
            action: 'SET_COMBAT',
            op: 'choice',
            effect: 'discard',
            actor: '$enemy',
            max: 1,
            candidates: '$enemyCards',
            optional: false,
          },
        ],
      },
    ],
  },
  {
    id: 'medusa_04',
    title: 'Зов стаи',
    type: 'hybrid',
    value: 4,
    bonus: 3,
    quantity: 2,
    fighter: 'harpies',
    text: 'ПОСЛЕ БИТВЫ: Каждая Гарпия может пройти до трёх клеток.',
    rules: [
      {
        moment: 'afterCombat',
        // живых Гарпий нет — двигать некого, эффект не срабатывает
        when: [
          {
            fact: 'FIGHTERS',
            params: { side: 'self', group: 'harpies' },
            min: 1,
            var: 'harpies',
          },
        ],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            budget: 3,
            fighters: '$harpies',
            optional: true,
          },
        ],
      },
    ],
  },
  {
    id: 'medusa_05',
    title: 'Капкан',
    type: 'hybrid',
    value: 3,
    bonus: 2,
    quantity: 3,
    fighter: 'harpies',
    text: 'ПОСЛЕ БИТВЫ: Оппонент, чей боец участвовал в этой битве, сбрасывает 1 карту из своей руки.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          // враг в этом бою — тот, кто играл против этой карты (карта hybrid: играет любая сторона)
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          // без карт в руке сбрасывать нечего: эффект не срабатывает, штрафов никаких
          { fact: 'HAND', params: { of: '$enemy', min: 1 }, var: 'enemyCards' },
        ],
        then: [
          {
            action: 'SET_COMBAT',
            op: 'choice',
            effect: 'discard',
            actor: '$enemy',
            max: 1,
            candidates: '$enemyCards',
            optional: false,
          },
        ],
      },
    ],
  },
  {
    id: 'medusa_06',
    title: 'Ускорение',
    type: 'hybrid',
    value: 3,
    bonus: 1,
    quantity: 3,
    fighter: 'any',
    text: 'ПОСЛЕ БИТВЫ: Ваш боец, участвовавший в этой битве, может пройти до трёх клеток.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          // свой боец в этом бою: у атакующего — атакующий, у защитника — тот, кого били
          { fact: 'COMBAT', params: { select: 'self' }, var: 'battleFighters' },
          // боец погиб в бою — двигать нечего, эффект сгорает
          {
            fact: 'FIGHTERS',
            params: { side: 'self', fighterIds: '$battleFighters' },
            min: 1,
            var: 'fighters',
          },
        ],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            budget: 3,
            fighters: '$fighters',
            optional: true,
          },
        ],
      },
    ],
  },
  {
    id: 'medusa_07',
    title: 'Ядовитая стрела',
    type: 'hybrid',
    value: 3,
    bonus: 1,
    quantity: 3,
    fighter: 'any',
    text: 'ПОСЛЕ БИТВЫ: Доберите 1 карту из колоды.',
    rules: [
      {
        moment: 'afterCombat',
        // добор обязательный: пустая колода бьёт главного героя истощением (правило SET_CARDS draw)
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
    ],
  },
  {
    id: 'medusa_08',
    title: 'Обманный маневр',
    type: 'hybrid',
    value: 2,
    bonus: 2,
    quantity: 3,
    fighter: 'any',
    text: 'МГНОВЕННО: Свойства карты оппонента в этой битве не действуют.',
    rules: [
      {
        moment: 'immediately',
        // у карты противника нет ни одного эффекта — отменять нечего, шаг помечается skipped
        when: [{ fact: 'COMBAT', params: { effects: 'opponent' }, min: 1 }],
        // отменяем тексты карты противника: её шаги в очереди боя помечаются cancelled.
        // Числа карты при этом не меняются — отменяются свойства, а не значение.
        then: [{ action: 'SET_COMBAT', op: 'cancelEffects', side: 'opponent' }],
      },
    ],
  },
  {
    id: 'medusa_09',
    title: 'Второе дыхание',
    type: 'hybrid',
    value: 1,
    bonus: 2,
    quantity: 3,
    fighter: 'any',
    text: 'ПОСЛЕ БИТВЫ: Доберите карту. В случае вашей победы доберите две.',
    rules: [
      // победа: вместо одной карты две. Условия правил взаимоисключающие, поэтому срабатывает ровно одно.
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
    id: 'medusa_10',
    title: 'Роковая встреча',
    type: 'effect',
    value: null,
    bonus: 4,
    quantity: 2,
    fighter: 'medusa',
    text: 'Выберите любого бойца в одной области с Медузой: он получает 2 урона.',
    rules: [
      {
        moment: 'effect',
        // «любого бойца» — и своих, и чужих: выбор обязательный (окно required), действие уже потрачено
        when: [
          {
            fact: 'FIGHTERS',
            params: { areaOf: 'medusa' },
            min: 1,
            var: 'targets',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            candidates: '$targets',
            count: 1,
            required: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -2 }],
      },
    ],
  },
  {
    id: 'medusa_11',
    title: 'Возрождение стаи',
    type: 'effect',
    value: null,
    bonus: 2,
    quantity: 2,
    fighter: 'any',
    text: 'Ваши бойцы могут пройти до трёх клеток каждый, в том числе сквозь занятые врагами. Затем в игру можно вернуть одну убитую Гарпию — на свободную клетку в области Медузы.',
    rules: [
      {
        moment: 'effect',
        // все свои бойцы, каждому до 3 клеток, враги путь не блокируют
        when: [{ fact: 'FIGHTERS', params: { side: 'self' }, min: 1, var: 'fighters' }],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            budget: 3,
            fighters: '$fighters',
            throughEnemies: true,
            optional: true,
          },
        ],
      },
      {
        moment: 'effect',
        // убитой Гарпии нет или в области Медузы нет свободной клетки — воскрешать некуда
        when: [
          { fact: 'LOST', params: { group: 'harpies' }, min: 1 },
          {
            fact: 'CELLS',
            params: { areaOf: 'medusa', free: true },
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
        then: [
          {
            action: 'REVIVE_FIGHTER',
            group: 'harpies',
            cellId: '$picked',
          },
        ],
      },
    ],
  },
];
