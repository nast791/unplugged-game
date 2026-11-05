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
      state: 'active',
      condition:
        'Активна с начала партии, пока Амат жива; в начале вашего хода становится не активной навсегда, если Амат мертва',
      icon: 'bx:wind',
    },
  ],
  tags: ['scales'],
  terrainAffinity: ['desert'],
  skill: {
    id: 'anubis_skill',
    type: 'skill',
    fighter: 'anubis',
    title: 'Суд Осириса',
    text: 'Пока пелена активна, на картах с пометкой весов работают Помилование (усиление карты противника не больше вашего) и Наказание (строго больше). НАЧАЛО ХОДА: Если Амат мертва, пелена рвётся навсегда.',
    rules: [
      {
        // пелена держится, пока жив зверь: потеря Амат рвёт её навсегда, и весы замолкают
        moment: 'turnStart',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'LOST', params: { group: 'amat', min: 1 } },
        ],
        then: [{ action: 'SET_ITEM', group: 'shroud', to: 'inactive' }],
      },
    ],
  },
};
