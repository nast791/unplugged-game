export default {
  id: 'anubis',
  name: 'Анубис',
  color: '#3B82F6',
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
      color: '#E7E5E4',
      state: 'inactive',
      states: { active: 'цела', inactive: 'отсутствует' },
      condition:
        'Появляется картой «Погребальная пелена»; цела, пока Анубис начинает ход на клетке со стихией пустыни',
      icon: 'arcticons:mistplay',
    },
  ],
  terrainAffinity: ['desert'],
  skill: {
    id: 'anubis_skill',
    type: 'skill',
    fighter: 'anubis',
    title: 'Взвешивание сердца',
    text: 'КОНЕЦ ХОДА: Если Анубис не двигался в этом ходу, выберите бойца противника в его области — он получает 1 урон (2, пока цела пелена). НАЧАЛО ХОДА: Если Анубис не стоит на клетке со стихией пустыни, пелена рвётся.',
    rules: [
      {
        moment: 'turnStart',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], terrain: 'desert' }, max: 0 },
        ],
        then: [{ action: 'SET_ITEM', group: 'shroud', to: 'inactive' }],
      },
      {
        moment: 'turnEnd',
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], movedThisTurn: true }, max: 0 },
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
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], movedThisTurn: true }, max: 0 },
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
