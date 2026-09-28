/** Колода Теслы. */
export default [
  {
    id: 'tesla_01',
    title: 'Поток энергии',
    type: 'attack',
    value: 5,
    bonus: 3,
    quantity: 2,
    fighter: 'tesla',
    text: 'ПОСЛЕ БИТВЫ: Выберите одно свойство:',
    options: [
      { id: 'charge', text: 'Активируйте обе катушки.' },
      {
        id: 'discharge',
        text: 'Деактивируйте обе катушки и подлечите Теслу на 2 здоровья.',
      },
    ],
    rules: [
      {
        moment: 'afterCombat',
        // выбор одного из двух свойств карты: ветки разбираются в моменте picked по отметке варианта
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            count: 1,
            required: true,
            candidates: ['charge', 'discharge'],
          },
        ],
      },
      {
        moment: 'picked',
        // «активируйте обе»: уже активные остаются активными — свойство выполняется, чем может
        when: [{ fact: 'PICKED', params: { is: 'charge' } }],
        then: [{ action: 'SET_ITEM', group: 'coil', to: 'active' }],
      },
      {
        moment: 'picked',
        // «деактивируйте обе и подлечите»: разряженные остаются разряженными, лечение применяется;
        // выше начального здоровья лечение не поднимает — это общее правило (SET_HEALTH)
        when: [
          { fact: 'PICKED', params: { is: 'discharge' } },
          {
            fact: 'FIGHTERS',
            params: { side: 'self', type: 'hero' },
            min: 1,
            var: 'heroes',
          },
        ],
        then: [
          { action: 'SET_ITEM', group: 'coil', to: 'inactive' },
          { action: 'SET_HEALTH', fighterIds: '$heroes', delta: 2 },
        ],
      },
    ],
  },
  {
    id: 'tesla_02',
    title: 'Низкая частота',
    type: 'attack',
    value: 4,
    bonus: 3,
    quantity: 3,
    fighter: 'tesla',
    text: 'ПОСЛЕ БИТВЫ: Вы можете деактивировать катушки:',
    options: [
      {
        id: 'spend1',
        text: 'Деактивируйте 1 катушку и получите 1 действие.',
        // первая ступень: нужна хотя бы одна активная катушка
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 1 }],
      },
      {
        id: 'spend2',
        text: 'Деактивируйте 2 катушки: получите 1 действие и доберите 1 карту.',
        // вторая ступень: доступна, только когда катушек хватает на обе
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 }],
      },
    ],
    rules: [
      {
        moment: 'afterCombat',
        // окно показывает обе ступени: недоступную помечает её собственное условие в card.options,
        // а сам выбор игрока потом лежит в PICKED
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            count: 1,
            required: false,
            candidates: ['spend1', 'spend2'],
          },
        ],
      },
      {
        moment: 'picked',
        // цена одной катушки: одно действие
        when: [{ fact: 'PICKED', params: { is: 'spend1' } }],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 1,
          },
          { action: 'SET_ACTIONS', delta: 1 },
        ],
      },
      {
        moment: 'picked',
        // цена двух катушек: действие и карта («также» — бонусы складываются)
        when: [
          { fact: 'PICKED', params: { is: 'spend2' } },
          { fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 },
        ],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 2,
          },
          { action: 'SET_ACTIONS', delta: 1 },
          { action: 'SET_CARDS', op: 'draw', count: 1 },
        ],
      },
    ],
  },
  {
    id: 'tesla_03',
    title: 'Фокусированный разряд',
    type: 'attack',
    value: 3,
    bonus: 4,
    quantity: 3,
    fighter: 'tesla',
    text: 'ВО ВРЕМЯ БИТВЫ: Вы можете деактивировать катушки:',
    options: [
      {
        id: 'focus1',
        text: 'Деактивируйте 1 катушку: считайте атаку этой карты равной 5.',
        // первая ступень: нужна хотя бы одна активная катушка
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 1 }],
      },
      {
        id: 'focus2',
        text: 'Деактивируйте 2 катушки: считайте атаку этой карты равной 7.',
        // вторая ступень: доступна, только когда катушек хватает на обе
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 }],
      },
    ],
    rules: [
      {
        moment: 'duringCombat',
        // окно показывает обе ступени: недоступную помечает её собственное условие в card.options
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            count: 1,
            required: false,
            candidates: ['focus1', 'focus2'],
          },
        ],
      },
      {
        moment: 'picked',
        // «эта карта» — сама карта боя: атака задаётся целиком, бонусы поверх неё складываются как обычно
        when: [{ fact: 'PICKED', params: { is: 'focus1' } }],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 1,
          },
          { action: 'SET_COMBAT', op: 'value', side: 'attack', to: 5 },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', params: { is: 'focus2' } },
          { fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 },
        ],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 2,
          },
          { action: 'SET_COMBAT', op: 'value', side: 'attack', to: 7 },
        ],
      },
    ],
  },
  {
    id: 'tesla_04',
    title: 'Научный прорыв',
    type: 'defense',
    value: 3,
    bonus: 2,
    quantity: 3,
    fighter: 'tesla',
    text: 'ПОСЛЕ БИТВЫ: Доберите 1 карту. Потом вы можете деактивировать катушки:',
    options: [
      {
        id: 'study1',
        text: 'Деактивируйте 1 катушку: доберите ещё 1 карту.',
        // первая ступень: нужна хотя бы одна активная катушка
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 1 }],
      },
      {
        id: 'study2',
        text: 'Деактивируйте 2 катушки: доберите ещё 2 карты и подлечите Теслу на 1 здоровье.',
        // вторая ступень: доступна, только когда катушек хватает на обе
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 }],
      },
    ],
    rules: [
      {
        moment: 'afterCombat',
        // «доберите 1 карту» — не цена, а сам эффект: он срабатывает всегда, ещё до выбора
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
      {
        moment: 'afterCombat',
        // базовая карта уже добрана: остались ступени цены — окно показывает обе, недоступную помечает условие
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            count: 1,
            required: false,
            candidates: ['study1', 'study2'],
          },
        ],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', params: { is: 'study1' } }],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 1,
          },
          { action: 'SET_CARDS', op: 'draw', count: 1 },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', params: { is: 'study2' } },
          { fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 },
          {
            fact: 'FIGHTERS',
            params: { side: 'self', type: 'hero' },
            min: 1,
            var: 'heroes',
          },
        ],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 2,
          },
          { action: 'SET_CARDS', op: 'draw', count: 2 },
          // лечение не поднимает здоровье выше начального — общее правило SET_HEALTH
          { action: 'SET_HEALTH', fighterIds: '$heroes', delta: 1 },
        ],
      },
    ],
  },
  {
    id: 'tesla_05',
    title: 'Рентгеновское излучение',
    type: 'hybrid',
    value: 4,
    bonus: 1,
    quantity: 3,
    fighter: 'tesla',
    text: 'ВО ВРЕМЯ БИТВЫ: Раскройте верхнюю карту колоды противника. Затем вы можете деактивировать катушки:',
    options: [
      {
        id: 'ray1',
        text: 'Деактивируйте 1 катушку: сбросьте эту карту.',
        // первая ступень: нужна хотя бы одна активная катушка
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 1 }],
      },
      {
        id: 'ray2',
        text: 'Деактивируйте 2 катушки: сбросьте её и прибавьте её бонус к значению этой карты.',
        // вторая ступень: доступна, только когда катушек хватает на обе
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 }],
      },
    ],
    rules: [
      {
        moment: 'duringCombat',
        // «противник» — участник этой битвы: колоду берём у него, а не у его напарника в 2v2
        when: [{ fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' }],
        // раскрыть — значит показать: карта остаётся на верху колоды, её видят все
        then: [{ action: 'SET_REVEAL', op: 'open', of: '$enemy' }],
      },
      {
        moment: 'duringCombat',
        // раскрывать нечего (пустая колода) — свойства нет; окно показывает обе ступени
        when: [
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          {
            fact: 'REVEALED',
            params: { of: '$enemy', select: 'cards' },
            min: 1,
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            count: 1,
            required: false,
            candidates: ['ray1', 'ray2'],
          },
        ],
      },
      {
        moment: 'picked',
        // ступень за две катушки: бонус раскрытой карты идёт в число этой карты.
        // Правило идёт до сброса — снимок раскрытого читается, пока сброс его не снял.
        when: [
          { fact: 'PICKED', params: { is: 'ray2' } },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          {
            fact: 'REVEALED',
            params: { of: '$enemy', select: 'bonus' },
            min: 1,
            var: 'bonus',
          },
        ],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: '$bonus' }],
      },
      {
        moment: 'picked',
        // карта без бонуса (bonus 0): прибавлять нечего — сброс всё равно срабатывает (золотое правило)
        when: [
          { fact: 'PICKED', params: { is: 'ray2' } },
          { fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          { fact: 'REVEALED', params: { of: '$enemy', select: 'cards' }, min: 1 },
        ],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 2,
          },
          { action: 'SET_REVEAL', op: 'discard', of: '$enemy' },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', params: { is: 'ray1' } },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          { fact: 'REVEALED', params: { of: '$enemy', select: 'cards' }, min: 1 },
        ],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 1,
          },
          { action: 'SET_REVEAL', op: 'discard', of: '$enemy' },
        ],
      },
    ],
  },
  {
    id: 'tesla_06',
    title: 'Грозовой шквал',
    type: 'hybrid',
    value: 3,
    bonus: 1,
    quantity: 3,
    fighter: 'tesla',
    text: 'ПОСЛЕ БИТВЫ: Вы можете деактивировать катушки:',
    options: [
      {
        id: 'storm1',
        text: 'Деактивируйте 1 катушку: нанесите 1 урон каждому бойцу оппонента в области Теслы.',
        // первая ступень: нужна хотя бы одна активная катушка
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 1 }],
      },
      {
        id: 'storm2',
        text: 'Деактивируйте 2 катушки: нанесите 2 урона каждому бойцу оппонента в области Теслы.',
        // вторая ступень: доступна, только когда катушек хватает на обе
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 }],
      },
    ],
    rules: [
      {
        moment: 'afterCombat',
        // бить некого (у оппонента нет бойцов в области Теслы) — свойства нет;
        // окно показывает обе ступени, недоступную помечает её условие
        when: [
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          { fact: 'FIGHTERS', params: { of: '$enemy', areaOf: 'tesla' }, min: 1 },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            count: 1,
            required: false,
            candidates: ['storm1', 'storm2'],
          },
        ],
      },
      {
        moment: 'picked',
        // урон получают бойцы оппонента в области Теслы: разряд бьёт по площади, а не по одному бойцу
        when: [
          { fact: 'PICKED', params: { is: 'storm1' } },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          {
            fact: 'FIGHTERS',
            params: { of: '$enemy', areaOf: 'tesla' },
            min: 1,
            var: 'foes',
          },
        ],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 1,
          },
          { action: 'SET_HEALTH', fighterIds: '$foes', delta: -1 },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', params: { is: 'storm2' } },
          { fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          {
            fact: 'FIGHTERS',
            params: { of: '$enemy', areaOf: 'tesla' },
            min: 1,
            var: 'foes',
          },
        ],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 2,
          },
          { action: 'SET_HEALTH', fighterIds: '$foes', delta: -2 },
        ],
      },
    ],
  },
  {
    id: 'tesla_07',
    title: 'Фазовый резонанс',
    type: 'hybrid',
    value: 3,
    bonus: 1,
    quantity: 3,
    fighter: 'tesla',
    text: 'МГНОВЕННО: Вы можете деактивировать катушки:',
    options: [
      {
        id: 'resonance1',
        text: 'Деактивируйте 1 катушку: свойства карты оппонента в этой битве не действуют.',
        // первая ступень: нужна хотя бы одна активная катушка
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 1 }],
      },
      {
        id: 'resonance2',
        text: 'Деактивируйте 2 катушки: свойства карты оппонента не действуют, и значение его карты становится 0.',
        // вторая ступень: доступна, только когда катушек хватает на обе
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 }],
      },
    ],
    rules: [
      {
        moment: 'immediately',
        // окно показывает обе ступени: недоступную помечает её собственное условие в card.options
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            count: 1,
            required: false,
            candidates: ['resonance1', 'resonance2'],
          },
        ],
      },
      {
        moment: 'picked',
        // «свойства не действуют»: очередь помечает шаги карты оппонента cancelled
        when: [{ fact: 'PICKED', params: { is: 'resonance1' } }],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 1,
          },
          { action: 'SET_COMBAT', op: 'cancelEffects', side: 'opponent' },
        ],
      },
      {
        moment: 'picked',
        // вторая ступень включает первую: свойства не действуют, и число карты оппонента обнуляется
        when: [
          { fact: 'PICKED', params: { is: 'resonance2' } },
          { fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 },
        ],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 2,
          },
          { action: 'SET_COMBAT', op: 'cancelEffects', side: 'opponent' },
          // side: 'opponent' — «карта оппонента»: её защита, если бил я, и её атака, если били меня
          { action: 'SET_COMBAT', op: 'value', side: 'opponent', to: 0 },
        ],
      },
    ],
  },
  {
    id: 'tesla_08',
    title: 'Энергетический импульс',
    type: 'hybrid',
    value: 2,
    bonus: 2,
    quantity: 3,
    fighter: 'tesla',
    text: 'ПОСЛЕ БИТВЫ: Передвиньте бойца оппонента, участвовавшего в битве, на расстояние до 2 клеток. Потом вы можете деактивировать катушки:',
    options: [
      {
        id: 'push1',
        text: 'Деактивируйте 1 катушку: передвиньте Теслу на расстояние до 2 клеток.',
        // первая ступень: нужна хотя бы одна активная катушка
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 1 }],
      },
      {
        id: 'push2',
        text: 'Деактивируйте 2 катушки: передвиньте Теслу на расстояние до 2 клеток, и оппонент сбрасывает 1 случайную карту из руки.',
        // вторая ступень: доступна, только когда катушек хватает на обе
        when: [{ fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 }],
      },
    ],
    rules: [
      {
        moment: 'afterCombat',
        // «до 2 клеток» включает 0: толчок необязательный, игрок может никого не двигать.
        // Погибшего в этой битве бойца оппонента толкать некуда — правило не срабатывает
        when: [
          {
            fact: 'COMBAT',
            params: { select: 'opponent' },
            var: 'enemyFighter',
          },
          {
            fact: 'FIGHTERS',
            params: { fighterIds: '$enemyFighter' },
            min: 1,
            var: 'pushed',
          },
        ],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            budget: 2,
            fighters: '$pushed',
            optional: true,
          },
        ],
      },
      {
        moment: 'afterCombat',
        // окно показывает обе ступени: недоступную помечает её собственное условие в card.options
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            count: 1,
            required: false,
            candidates: ['push1', 'push2'],
          },
        ],
      },
      {
        moment: 'picked',
        // Тесла идёт следом за толчком: тоже «до 2 клеток», поэтому черновик необязательный
        when: [
          { fact: 'PICKED', params: { is: 'push1' } },
          {
            fact: 'FIGHTERS',
            params: { side: 'self', type: 'hero' },
            min: 1,
            var: 'heroes',
          },
        ],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 1,
          },
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            budget: 2,
            fighters: '$heroes',
            optional: true,
          },
        ],
      },
      {
        moment: 'picked',
        // вторая ступень включает первую: Тесла идёт, и оппонент теряет случайную карту.
        // Карту выбирает последовательность партии (helpers/random.js), игрок её не выбирает.
        when: [
          { fact: 'PICKED', params: { is: 'push2' } },
          { fact: 'ITEMS', params: { group: 'coil', state: 'active' }, min: 2 },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          {
            fact: 'FIGHTERS',
            params: { side: 'self', type: 'hero' },
            min: 1,
            var: 'heroes',
          },
        ],
        then: [
          {
            action: 'SET_ITEM',
            group: 'coil',
            from: 'active',
            to: 'inactive',
            count: 2,
          },
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            budget: 2,
            fighters: '$heroes',
            optional: true,
          },
          { action: 'SET_CARDS', op: 'discard', of: '$enemy', random: true },
        ],
      },
    ],
  },
  {
    id: 'tesla_09',
    title: 'Инерционный заряд',
    type: 'hybrid',
    value: 2,
    bonus: 1,
    quantity: 3,
    fighter: 'tesla',
    text: 'ПОСЛЕ БИТВЫ: Активируйте 1 катушку. В случае вашей победы активируйте обе.',
    rules: [
      {
        moment: 'afterCombat',
        // разряженная катушка одна: уже активная остаётся активной — золотое правило
        then: [{ action: 'SET_ITEM', group: 'coil', to: 'active', count: 1 }],
      },
      {
        moment: 'afterCombat',
        // «в случае вашей победы» — победа в этой битве, от любой стороны: победителем бывает и защитник
        when: [{ fact: 'COMBAT', params: { winner: 'self' } }],
        then: [{ action: 'SET_ITEM', group: 'coil', to: 'active' }],
      },
    ],
  },
  {
    id: 'tesla_10',
    title: 'Волновое воздействие',
    type: 'effect',
    value: null,
    bonus: 3,
    quantity: 2,
    fighter: 'tesla',
    text: 'Передвиньте всех чужих бойцов на расстояние до 2 клеток. Получите 1 дополнительное действие.',
    rules: [
      {
        moment: 'effect',
        // «чужие бойцы» — все, кто не мой и не мой напарник: в 2v2 это бойцы обоих соперников,
        // в игре на троих и больше — бойцы всех остальных игроков. Своих и союзников не трогаем.
        // «До 2 клеток» включает 0: черновик необязательный, можно никого не двигать
        when: [
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent' },
            min: 1,
            var: 'foes',
          },
        ],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            budget: 2,
            fighters: '$foes',
            optional: true,
          },
        ],
      },
      {
        moment: 'effect',
        // действие возвращается после перемещения: карта стоит одно действие и отдаёт его обратно
        then: [{ action: 'SET_ACTIONS', delta: 1 }],
      },
    ],
  },
  {
    id: 'tesla_11',
    title: 'Максимальная мощность',
    type: 'effect',
    value: null,
    bonus: 1,
    quantity: 2,
    fighter: 'tesla',
    text: 'Активируйте обе катушки. Получите 1 дополнительное действие.',
    rules: [
      {
        moment: 'effect',
        // действие на карту тратит сама карта: свойство возвращает его обратно
        then: [
          { action: 'SET_ITEM', group: 'coil', to: 'active' },
          { action: 'SET_ACTIONS', delta: 1 },
        ],
      },
    ],
  },
];
