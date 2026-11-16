export default {
  id: 'ifrit',
  name: 'Ифрит',
  color: '#D9532F',
  heroes: [
    {
      id: 'ifrit',
      name: 'Ифрит',
      type: 'hero',
      hp: 14,
      move: 2,
      attackRange: 3,
      size: 1,
      image: 'avatar-ifrit.webp',
    },
  ],
  assistants: [
    {
      id: 'ash',
      name: 'Пепельный дух',
      type: 'assistant',
      count: 3,
      hp: 1,
      move: 3,
      attackRange: 1,
      size: 1,
      image: 'avatar-ash.webp',
    },
  ],
  items: [],
  terrainAffinity: ['lava', 'desert'],
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
            toggle: true,
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
  // Арты лежат рядом с паком (`images/`), а наружу отдаются маршрутом
  // `/api/content/heroes/ifrit/images/{файл}` — путь собирает `server/utils.js: heroImageUrl`.
  images: {
    hero: 'hero.webp',
  },
};
