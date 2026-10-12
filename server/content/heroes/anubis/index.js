export default {
  id: 'anubis',
  name: 'Анубис',
  color: '#EDC9AF',
  heroes: [
    {
      id: 'anubis',
      name: 'Анубис',
      type: 'hero',
      hp: 15,
      move: 2,
      attackRange: 2,
      size: 1,
    },
  ],
  assistants: [
    {
      id: 'amat',
      name: 'Амат',
      type: 'assistant',
      count: 1,
      hp: 8,
      move: 2,
      attackRange: 1,
      size: 1,
    },
  ],
  items: [
    {
      id: 'shroud',
      name: 'Пелена',
      type: 'item',
      count: 1,
      color: '#D4B97A',
      state: 'inactive',
      states: { active: 'цела', inactive: 'отсутствует' },
      condition:
        'Появляется картой «Погребальная пелена»; цела, пока Амат жива — в начале вашего хода пелена рвётся, если Амат мертва',
      icon: 'bx:wind',
    },
  ],
  terrainAffinity: ['desert'],
  skill: {
    id: 'anubis_skill',
    type: 'skill',
    fighter: 'anubis',
    title: 'Взвешивание сердца',
    text: 'КОНЕЦ ХОДА: Если Анубис не наносил урон в этом ходу, выберите бойца противника в его области — он получает 1 урон (2, пока цела пелена). НАЧАЛО ХОДА: Если Амат мертва, пелена рвётся.',
    rules: [
      {
        // пелена держится, пока жив зверь: потеря Амат снимает и «поедание» карт, и усиленный суд
        moment: 'turnStart',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'LOST', params: { group: 'amat', min: 1 } },
        ],
        then: [{ action: 'SET_ITEM', group: 'shroud', to: 'inactive' }],
      },
      {
        moment: 'turnEnd',
        when: [
          // условие — урон, а не шаг: суд молчит в тот ход, когда Анубис бил сам
          {
            fact: 'FIGHTERS',
            params: { fighterIds: ['anubis'], dealtDamageThisTurn: true },
            max: 0,
          },
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent', areaOf: 'anubis' },
            min: 1,
            var: 'foes',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'fighters',
            candidates: '$foes',
            count: 1,
            required: false,
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', var: 'picked' },
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -2 }],
      },
      {
        moment: 'turnEnd',
        when: [
          {
            fact: 'FIGHTERS',
            params: { fighterIds: ['anubis'], dealtDamageThisTurn: true },
            max: 0,
          },
          { fact: 'ITEMS', params: { group: 'shroud', state: 'inactive' }, min: 1 },
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent', areaOf: 'anubis' },
            min: 1,
            var: 'foes',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'fighters',
            candidates: '$foes',
            count: 1,
            required: false,
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', var: 'picked' },
          { fact: 'ITEMS', params: { group: 'shroud', state: 'inactive' }, min: 1 },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 }],
      },
    ],
  },
};
