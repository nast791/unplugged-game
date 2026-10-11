export default {
  id: 'ifrit',
  name: 'Ифрит',
  color: '#EA580C',
  heroes: [
    {
      id: 'ifrit',
      name: 'Ифрит',
      type: 'hero',
      hp: 14,
      move: 2,
      attackRange: 3,
      size: 1,
    },
  ],
  assistants: [
    {
      id: 'ash',
      name: 'Пепельные духи',
      type: 'assistant',
      count: 3,
      hp: 1,
      move: 3,
      attackRange: 1,
      size: 1,
    },
  ],
  items: [],
  skill: {
    id: 'ifrit_skill',
    type: 'skill',
    fighter: 'ifrit',
    title: 'Пламя преисподней',
    text: 'НАЧАЛО ХОДА: Можете убить своего пепельного духа — получите 1 действие до конца хода.',
    rules: [
      {
        moment: 'turnStart',
        when: [
          {
            fact: 'FIGHTERS',
            params: { side: 'self', group: 'ash', min: 1 },
            var: 'spirits',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            candidates: '$spirits',
            count: 1,
            required: false,
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [
          { action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 },
          { action: 'SET_ACTIONS', delta: 1 },
        ],
      },
    ],
  },
};
