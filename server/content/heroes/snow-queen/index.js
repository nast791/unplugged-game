export default {
  id: 'snow-queen',
  name: 'Снежная королева',
  color: '#7DD3FC',
  heroes: [
    {
      id: 'snow-queen',
      name: 'Снежная королева',
      type: 'hero',
      hp: 16,
      move: 2,
      attackRange: 3,
      size: 1,
    },
  ],
  assistants: [
    {
      id: 'crow',
      name: 'Кристальные вороны',
      type: 'assistant',
      count: 2,
      hp: 2,
      move: 3,
      attackRange: 1,
      size: 1,
    },
  ],
  items: [
    {
      id: 'shard',
      name: 'Осколки',
      type: 'item',
      count: 12,
      color: '#BAE6FD',
      state: 'ice',
      hiddenStates: ['ice'],
      display: 'counter',
      states: { ice: 'во льду', collected: 'собраны' },
      icon: 'lucide:snowflake',
    },
  ],
  tags: ['shard'],
  terrainAffinity: ['ice'],
  skill: {
    id: 'snow-queen_skill',
    type: 'skill',
    fighter: 'snow-queen',
    title: 'Вечная мерзлота',
    text: 'Пока в вашем сбросе 5 и более карт с осколком, лимит руки каждого противника — 5 вместо 7. Когда Кристальная ворона погибает, игрок мгновенно сбрасывает верхнюю карту колоды Снежной королевы; если на ней есть осколок, он засчитывается.',
    rules: [
      {
        moment: 'turnEnd',
        when: [{ fact: 'CARDS', params: { zone: 'discard', tag: 'shard', min: 5 } }],
        then: [{ action: 'SET_HAND_LIMIT', of: 'enemies', value: 5 }],
      },
      {
        moment: 'turnEnd',
        when: [{ fact: 'CARDS', params: { zone: 'discard', tag: 'shard' }, max: 4 }],
        then: [{ action: 'SET_HAND_LIMIT', of: 'enemies', value: null }],
      },
      {
        moment: 'lost',
        when: [
          { fact: 'DEATH', params: { group: 'crow' } },
          { fact: 'DECK', params: { min: 1 } },
        ],
        then: [{ action: 'SET_CARDS', op: 'discard', from: 'deck', count: 1 }],
      },
    ],
  },
};
