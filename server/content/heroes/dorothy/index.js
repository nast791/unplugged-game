export default {
  id: 'dorothy',
  name: 'Дороти',
  color: '#8B5CF6',
  heroes: [
    {
      id: 'dorothy',
      name: 'Дороти',
      type: 'hero',
      hp: 13,
      move: 2,
      attackRange: 1,
      size: 1,
    },
  ],
  assistants: [
    {
      id: 'toto',
      name: 'Тото',
      type: 'assistant',
      count: 1,
      hp: 6,
      move: 3,
      attackRange: 1,
      size: 1,
    },
  ],
  items: [],
  skill: {
    id: 'dorothy_skill',
    type: 'skill',
    fighter: 'dorothy',
    title: 'Серебряные башмачки',
    text: 'КОНЕЦ ХОДА: Если Дороти и Тото стоят в одной области, можете кликнуть по любому из них — они меняются местами.',
    rules: [
      {
        moment: 'turnEnd',
        when: [
          {
            fact: 'FIGHTERS',
            params: { fighterIds: ['dorothy', 'toto'], areaOf: 'dorothy' },
            min: 2,
            var: 'pair',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            candidates: '$pair',
            count: 1,
            required: false,
          },
        ],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SWAP_FIGHTERS', a: 'dorothy', b: 'toto' }],
      },
    ],
  },
};
