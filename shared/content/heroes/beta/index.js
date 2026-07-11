export default {
  id: 'beta',
  name: 'Бета',
  color: '#EF4444',
  heroes: [
    {
      id: 'beta',
      name: 'Бета',
      hp: 13,
      move: 3,
      attackType: 'ranged',
      attackRange: 1,
      size: 1,
    },
  ],
  assistants: [
    {
      id: 'beta_scout',
      name: 'Разведчик Беты',
      hp: 3,
      move: 3,
      attackType: 'melee',
      attackRange: 1,
      size: 1,
      count: 1,
    },
  ],
  items: [
    {
      id: 'beta_marker',
      type: 'marker',
      count: 2,
      color: '#F97316',
      state: 'inactive',
      icon: 'bi:bullseye',
      name: 'Маркер Беты',
    },
  ],
  skill: {
    id: 'beta_skill',
    name: 'Дистанция',
    text: 'Схематичный скилл. 2 маркера: inactive → active по правилам хоста.',
  },
}
