export default {
  id: 'dorothy',
  name: 'Дороти',
  color: '#9AA1AB',
  heroes: [
    {
      id: 'dorothy',
      name: 'Дороти',
      type: 'hero',
      hp: 13,
      move: 2,
      attackRange: 1,
      size: 1,
      image: 'avatar-dorothy.webp',
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
      image: 'avatar-toto.webp',
    },
  ],
  items: [],
  // Арты лежат рядом с паком (`images/`), а наружу отдаются маршрутом
  // `/api/content/heroes/dorothy/images/{файл}` — когда бэкенд начнёт отдавать картинки сам, поменяется
  // только сборка пути в `server/utils.js: heroImageUrl`.
  images: {
    hero: 'hero.webp',
    back: 'card-back.webp',
  },
  skill: {
    id: 'dorothy_skill',
    type: 'skill',
    fighter: 'dorothy',
    title: 'Серебряные башмачки',
    text: 'КОНЕЦ ХОДА: Можете кликнуть по Дороти или Тото — они меняются местами.',
    rules: [
      {
        moment: 'turnEnd',
        text: 'Можете кликнуть по Дороти или Тото — они меняются местами.',
        when: [
          {
            // обмен без ограничения областью: Дороти и Тото меняются местами через всю карту.
            // Статус проверять не нужно: сроки `turnEnd` снимаются на входе в хук — раньше этого
            // правила (`shared/lifecycle/turnEnd.js`), поэтому замороженной пары здесь уже не бывает
            fact: 'FIGHTERS',
            params: { fighterIds: ['dorothy', 'toto'] },
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
        text: 'Поменяйте местами Дороти и Тото.',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SWAP_FIGHTERS', a: 'dorothy', b: 'toto' }],
      },
    ],
  },
};
