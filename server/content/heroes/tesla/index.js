export default {
  id: 'tesla',
  name: 'Никола Тесла',
  color: '#EF4444',
  heroes: [
    {
      id: 'tesla',
      name: 'Никола Тесла',
      type: 'hero',
      hp: 14,
      move: 2,
      // дальник: дальность задаёт attackRange (прежний признак attackType убран)
      attackRange: 3,
      size: 1,
    },
  ],
  assistants: [],
  items: [
    {
      id: 'coil',
      name: 'Катушка Теслы',
      type: 'item',
      count: 2,
      color: '#FACC15',
      // обе катушки начинают игру неактивными; одну активирует правило начала игры ниже
      state: 'inactive',
      icon: 'bi:lightning-fill',
    },
  ],
  skill: {
    id: 'tesla_skill',
    type: 'skill',
    fighter: 'tesla',
    title: 'Мастерство катушек',
    text: 'НАЧАЛО ИГРЫ: 1 катушка уже активна. КОНЕЦ ХОДА: Если есть неактивная катушка, активируйте 1. НАЧАЛО ХОДА: Если обе катушки активны, нанесите 1 урон каждому вражескому бойцу на соседних с Теслой клетках и передвиньте их на расстояние до 1 клетки.',
    rules: [
      {
        moment: 'gameStart',
        // «НАЧАЛО ИГРЫ: 1 катушка уже активна» — правило, а не состояние пака
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'inactive',
            to: 'active',
            count: 1,
          },
        ],
      },
      {
        moment: 'turnEnd',
        // катушки заряжаются сами: одна за каждый свой ход, но если обе уже активны — пропускаем
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'inactive' }, min: 1 }],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'inactive',
            to: 'active',
            count: 1,
          },
        ],
      },
      {
        moment: 'turnStart',
        // обе катушки активны — разряд по врагам на соседних клетках
        when: [
          { fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 },
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent', adjacentTo: 'tesla' },
            min: 1,
            var: 'foes',
          },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$foes', delta: -1 }],
      },
      {
        moment: 'turnStart',
        // и толкаем тех, кто ещё стоит рядом: по одному, на расстояние до 1 клетки (можно и на 0)
        when: [
          { fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 },
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent', adjacentTo: 'tesla' },
            min: 1,
            var: 'foes',
          },
        ],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            budget: 1,
            fighters: '$foes',
            optional: true,
          },
        ],
      },
    ],
  },
};
